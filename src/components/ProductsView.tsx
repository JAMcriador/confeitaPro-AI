import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { db, handleFirestoreError, OperationType, collection, doc, setDoc, updateDoc, deleteDoc, getDocs } from '../firebase';
import { Product, RecipeItem, InventoryItem } from '../types';
import { PRESET_PRODUCTS } from '../utils/assets';
import { Plus, Edit2, Trash2, Check, X, Camera, Clock, Tag, ShoppingBasket } from 'lucide-react';

interface ProductsViewProps {
  storeId: string;
  ownerId: string;
}

export default function ProductsView({ storeId, ownerId }: ProductsViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Bolos');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number | ''>('');
  const [productionTime, setProductionTime] = useState<number | ''>('');
  const [imageUrl, setImageUrl] = useState('');
  const [active, setActive] = useState(true);

  // Recipe states
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [recipeQuantity, setRecipeQuantity] = useState<number | ''>('');

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState('Todos');

  const categories = ['Todos', 'Bolos', 'Docinhos', 'Tortas', 'Cupcakes', 'Sobremesas', 'Outros'];

  useEffect(() => {
    async function loadProductsAndInventory() {
      try {
        setLoading(true);
        const path = `stores/${storeId}/products`;
        const snap = await getDocs(collection(db, path));
        const list: Product[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Product);
        });
        setProducts(list);

        const invPath = `stores/${storeId}/inventory`;
        const invSnap = await getDocs(collection(db, invPath));
        const invList: InventoryItem[] = [];
        invSnap.forEach((doc) => {
          invList.push({ id: doc.id, ...doc.data() } as InventoryItem);
        });
        setInventoryItems(invList);
      } catch (error) {
        console.error("Error loading products and inventory:", error);
      } finally {
        setLoading(false);
      }
    }
    if (storeId) {
      loadProductsAndInventory();
    }
  }, [storeId]);

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setName('');
    setCategory('Bolos');
    setDescription('');
    setPrice('');
    setProductionTime('');
    setImageUrl(PRESET_PRODUCTS[0].url); // Default preset image
    setActive(true);
    setRecipe([]);
    setSelectedIngredientId('');
    setRecipeQuantity('');
    setShowForm(true);
  };

  const handleOpenEdit = (prod: Product) => {
    setEditingProduct(prod);
    setName(prod.name);
    setCategory(prod.category || 'Bolos');
    setDescription(prod.description || '');
    setPrice(prod.price);
    setProductionTime(prod.productionTime || '');
    setImageUrl(prod.imageUrl || PRESET_PRODUCTS[0].url);
    setActive(prod.active);
    setRecipe(prod.recipe || []);
    setSelectedIngredientId('');
    setRecipeQuantity('');
    setShowForm(true);
  };

  const handleDelete = async (productId: string) => {
    if (!window.confirm("Deseja realmente excluir este produto?")) return;
    const path = `stores/${storeId}/products`;
    try {
      await deleteDoc(doc(db, path, productId));
      setProducts(prev => prev.filter(p => p.id !== productId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${path}/${productId}`);
    }
  };

  const handleToggleActive = async (prod: Product) => {
    const path = `stores/${storeId}/products`;
    const updatedActive = !prod.active;
    try {
      await updateDoc(doc(db, path, prod.id), { active: updatedActive });
      setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, active: updatedActive } : p));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${path}/${prod.id}`);
    }
  };

  const handleAddRecipeItem = () => {
    if (!selectedIngredientId || recipeQuantity === '' || Number(recipeQuantity) <= 0) return;
    const ingredient = inventoryItems.find(item => item.id === selectedIngredientId);
    if (!ingredient) return;

    const existingIndex = recipe.findIndex(item => item.ingredientId === selectedIngredientId);
    if (existingIndex > -1) {
      setRecipe(prev => prev.map((item, idx) => 
        idx === existingIndex 
          ? { ...item, quantity: Number(recipeQuantity) }
          : item
      ));
    } else {
      const newItem: RecipeItem = {
        ingredientId: selectedIngredientId,
        name: ingredient.name,
        quantity: Number(recipeQuantity),
        unit: ingredient.unit
      };
      setRecipe(prev => [...prev, newItem]);
    }
    setSelectedIngredientId('');
    setRecipeQuantity('');
  };

  const handleRemoveRecipeItem = (ingId: string) => {
    setRecipe(prev => prev.filter(item => item.ingredientId !== ingId));
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || price === '') return;

    const path = `stores/${storeId}/products`;
    const id = editingProduct ? editingProduct.id : doc(collection(db, 'dummy')).id;

    const payload: Product = {
      id,
      storeId,
      ownerId,
      name,
      category,
      description,
      price: Number(price),
      productionTime: productionTime ? Number(productionTime) : 0,
      imageUrl: imageUrl || 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&auto=format&fit=crop&q=80',
      active,
      recipe,
      createdAt: editingProduct ? editingProduct.createdAt : new Date().toISOString()
    };

    try {
      await setDoc(doc(db, path, id), payload);
      if (editingProduct) {
        setProducts(prev => prev.map(p => p.id === id ? payload : p));
      } else {
        setProducts(prev => [...prev, payload]);
      }
      setShowForm(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${path}/${id}`);
    }
  };

  const handleImageUploadSimulated = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Simulate local upload by using FileReader
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const filteredProducts = products.filter(p => {
    if (selectedCategory === 'Todos') return true;
    return p.category === selectedCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-natural-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif italic text-[#4A3F35]">Cardápio de Doces</h2>
          <p className="text-sm text-[#A69C91]">Cadastre e gerencie o catálogo que seus clientes verão na loja online.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="bg-[#4A3F35] text-white font-semibold text-sm px-6 py-3 rounded-2xl hover:bg-[#5A4F44] transition-all shadow-md shadow-stone-200/50 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Cadastrar Produto
        </button>
      </div>

      {/* Category Tabs Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`whitespace-nowrap px-5 py-2.5 rounded-2xl text-xs font-bold transition-all border ${
              selectedCategory === cat
                ? 'bg-[#F5F2EB] text-[#4A3F35] border-[#EBE9E1] shadow-xs'
                : 'bg-white text-[#A69C91] border-transparent hover:text-[#4A3F35] hover:bg-[#F5F2EB]/30'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Catalog Cards */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-[2rem] border border-[#EBE9E1] p-12 text-center max-w-lg mx-auto space-y-6 shadow-sm">
          <div className="p-4 bg-[#F5F2EB] rounded-full w-16 h-16 flex items-center justify-center mx-auto text-[#D4A373]">
            <Clock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-[#4A3F35] text-lg">Seu cardápio está vazio</h3>
            <p className="text-sm text-[#A69C91]">Cadastre seus bolos, doces, bombons e tortas para que seus clientes possam fazer encomendas online!</p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="bg-[#4A3F35] hover:bg-[#5A4F44] text-white text-xs font-bold px-5 py-3 rounded-xl transition-all"
          >
            Cadastrar meu primeiro produto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredProducts.map((prod) => (
            <div
              key={prod.id}
              className={`bg-white rounded-[2rem] overflow-hidden border transition-all duration-300 shadow-sm flex flex-col justify-between hover:shadow-md ${
                prod.active ? 'border-[#EBE9E1]' : 'border-[#FAF9F6] bg-stone-50/50 opacity-75'
              }`}
            >
              {/* Product Image & Badges */}
              <div className="relative h-52 w-full bg-[#FAF9F6] overflow-hidden">
                <img
                  src={prod.imageUrl || PRESET_PRODUCTS[0].url}
                  alt={prod.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="bg-[#4A3F35]/80 text-white text-[10px] font-bold tracking-wider px-3 py-1 rounded-full backdrop-blur-xs uppercase">
                    {prod.category}
                  </span>
                </div>
                <div className="absolute top-4 right-4">
                  <button
                    onClick={() => handleToggleActive(prod)}
                    className={`p-2 rounded-full backdrop-blur-xs transition shadow-sm ${
                      prod.active ? 'bg-[#E9EDC6] text-[#5A5A40]' : 'bg-stone-500/90 text-white'
                    }`}
                    title={prod.active ? "Ativo no Cardápio" : "Pausado/Inativo"}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Product Info */}
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-bold text-[#4A3F35] text-base leading-snug">{prod.name}</h4>
                    <span className="text-[#D4A373] font-serif font-bold text-lg whitespace-nowrap">
                      {prod.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <p className="text-[#A69C91] text-xs line-clamp-2 leading-relaxed">{prod.description || 'Sem descrição.'}</p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[#FAF9F6]">
                  <div className="flex items-center text-[#A69C91] gap-2">
                    <Clock className="w-4 h-4 text-[#D4A373]" />
                    <span className="text-[11px] font-semibold">
                      {prod.productionTime ? `${prod.productionTime} min` : 'Pronta entrega'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(prod)}
                      className="p-2 text-[#A69C91] hover:text-[#4A3F35] hover:bg-[#F5F2EB] rounded-xl transition"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(prod.id)}
                      className="p-2 text-[#A69C91] hover:text-[#EF4444] hover:bg-red-55/10 rounded-xl transition"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slide-over or Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Scrollable */}
            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              {/* Product Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Nome do Produto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Bolo de Brigadeiro com Morango"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:border-pink-500 focus:bg-white outline-none transition"
                />
              </div>

              {/* Category & Price Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:border-pink-500 focus:bg-white outline-none transition"
                  >
                    <option value="Bolos">Bolos</option>
                    <option value="Docinhos">Docinhos</option>
                    <option value="Tortas">Tortas</option>
                    <option value="Cupcakes">Cupcakes</option>
                    <option value="Sobremesas">Sobremesas</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0,00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:border-pink-500 focus:bg-white outline-none transition"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Descrição do Produto</label>
                <textarea
                  rows={3}
                  placeholder="Descreva os ingredientes, recheios, tamanho ou quantidade de fatias..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:border-pink-500 focus:bg-white outline-none transition resize-none"
                />
              </div>

              {/* Production Time */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Tempo de Produção (Minutos)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Tempo em minutos (Ex: 120 para 2h)"
                  value={productionTime}
                  onChange={(e) => setProductionTime(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:border-pink-500 focus:bg-white outline-none transition"
                />
                <span className="text-[10px] text-gray-400">Deixe em branco ou zero para produtos de pronta entrega.</span>
              </div>

              {/* Image Input Selection & Files */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-gray-700 block">Foto do Doce</label>
                
                {/* File Upload Selector */}
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-gray-150 bg-zinc-100 overflow-hidden relative border border-gray-200 flex-shrink-0">
                    {imageUrl ? (
                      <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-gray-400">
                        <Camera className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUploadSimulated}
                      className="hidden"
                      id="upload-prod-image"
                    />
                    <label
                      htmlFor="upload-prod-image"
                      className="cursor-pointer inline-block bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs px-3 py-2 rounded-lg transition"
                    >
                      Upload do Celular/PC
                    </label>
                    <p className="text-[10px] text-gray-400">Ou selecione um preset abaixo:</p>
                  </div>
                </div>

                {/* Preset Options */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {PRESET_PRODUCTS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setImageUrl(preset.url)}
                      className={`h-12 rounded-lg overflow-hidden border-2 relative ${
                        imageUrl === preset.url ? 'border-pink-500 scale-95 shadow-sm' : 'border-transparent'
                      }`}
                      title={preset.name}
                    >
                      <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              {/* FICHA TÉCNICA (RECEITA) */}
              <div className="space-y-3 pt-4 border-t border-gray-150">
                <div className="flex items-center gap-2 text-stone-700">
                  <ShoppingBasket className="w-5 h-5 text-[#D4A373]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#4A3F35]">Ficha Técnica (Receita)</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-normal">
                  Vincule os ingredientes do estoque para que o sistema faça a baixa automática quando o pedido for confirmado.
                </p>

                {/* Dropdown & Quantity input row */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end bg-[#FAF9F6] p-4 rounded-2xl border border-[#EBE9E1]/50">
                  <div className="sm:col-span-6 space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Ingrediente</label>
                    <select
                      value={selectedIngredientId}
                      onChange={(e) => setSelectedIngredientId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-pink-500"
                    >
                      <option value="">Selecione...</option>
                      {inventoryItems.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-4 space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Quant. Necessária</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Ex: 500"
                        value={recipeQuantity}
                        onChange={(e) => setRecipeQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full pl-3 pr-10 py-2 text-xs bg-white border border-gray-200 rounded-xl outline-none"
                      />
                      <span className="absolute right-3 top-2 text-[10px] font-bold text-[#A69C91]">
                        {inventoryItems.find(item => item.id === selectedIngredientId)?.unit || ''}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddRecipeItem}
                    className="sm:col-span-2 w-full bg-[#4A3F35] text-white font-bold text-[10px] py-2 px-3 rounded-xl hover:bg-[#5A4F44] transition text-center"
                  >
                    Vincular
                  </button>
                </div>

                {/* Recipe ingredients list */}
                {recipe.length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic text-center py-2">Nenhum ingrediente vinculado a este produto ainda.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {recipe.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-[#FAF9F6]/50 border border-gray-100 p-2.5 rounded-xl text-xs">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-800">{item.name}</span>
                          <span className="text-[10px] text-gray-400">Quantidade por receita: <strong className="text-[#4A3F35]">{item.quantity} {item.unit}</strong></span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveRecipeItem(item.ingredientId)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition"
                          title="Remover do vínculo"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status toggle */}
              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-gray-700 block">Disponível para Encomenda</span>
                  <span className="text-[10px] text-gray-400">Se desativado, o doce ficará oculto na sua loja online.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActive(!active)}
                  className={`w-11 h-6 rounded-full p-1 transition duration-200 outline-none ${
                    active ? 'bg-pink-600' : 'bg-gray-300'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition duration-200 transform ${
                    active ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Save Footer */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-150">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-200 transition text-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-pink-600 text-white font-bold text-sm rounded-xl hover:bg-pink-700 transition text-center"
                >
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
