import { useState, useEffect, FormEvent } from 'react';
import { db, handleFirestoreError, OperationType, collection, doc, setDoc, updateDoc, deleteDoc, getDocs, query, orderBy } from '../firebase';
import { InventoryItem, InventoryLog, ShoppingListItem } from '../types';
import { 
  Plus, Trash2, Edit2, AlertTriangle, PlusCircle, MinusCircle, Check, X, ClipboardList, 
  History, ShoppingCart, Share2, Printer, Search, Layers, FileText, ShoppingBag, CheckSquare, Square
} from 'lucide-react';

interface InventoryViewProps {
  storeId: string;
  ownerId: string;
}

export default function InventoryView({ storeId, ownerId }: InventoryViewProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [customShoppingItems, setCustomShoppingItems] = useState<ShoppingListItem[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stock' | 'shopping' | 'history'>('stock');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Inventory Form Modal Fields
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Ingredientes'); // Default category
  const [quantity, setQuantity] = useState<number | ''>('');
  const [unit, setUnit] = useState('g');
  const [minStock, setMinStock] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  // Shopping List Modal Fields
  const [newShopItemName, setNewShopItemName] = useState('');
  const [newShopItemQty, setNewShopItemQty] = useState<number | ''>('');
  const [newShopItemUnit, setNewShopItemUnit] = useState('un');

  // Load standard inventory
  const loadInventory = async () => {
    const path = `stores/${storeId}/inventory`;
    try {
      const snap = await getDocs(collection(db, path));
      const list: InventoryItem[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as InventoryItem);
      });
      setItems(list);
    } catch (error) {
      console.error("Error loading inventory:", error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  };

  // Load audit logs
  const loadLogs = async () => {
    const path = `stores/${storeId}/inventory_logs`;
    try {
      const q = query(collection(db, path), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: InventoryLog[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as InventoryLog);
      });
      setLogs(list);
    } catch (error) {
      console.error("Error loading logs:", error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  };

  // Load shopping list
  const loadShoppingList = async () => {
    const path = `stores/${storeId}/shopping_list`;
    try {
      const snap = await getDocs(collection(db, path));
      const list: ShoppingListItem[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as ShoppingListItem);
      });
      setCustomShoppingItems(list);
    } catch (error) {
      console.error("Error loading shopping list:", error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  };

  useEffect(() => {
    async function loadAllData() {
      if (!storeId) return;
      setLoading(true);
      await Promise.all([loadInventory(), loadLogs(), loadShoppingList()]);
      setLoading(false);
    }
    loadAllData();
  }, [storeId]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setName('');
    setCategory('Ingredientes');
    setQuantity('');
    setUnit('g');
    setMinStock('');
    setNotes('');
    setShowForm(true);
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setName(item.name);
    setCategory(item.category || 'Ingredientes');
    setQuantity(item.quantity);
    setUnit(item.unit);
    setMinStock(item.minStock);
    setNotes(item.notes || '');
    setShowForm(true);
  };

  const handleDelete = async (itemId: string) => {
    if (!window.confirm("Deseja realmente remover este item do estoque?")) return;
    const path = `stores/${storeId}/inventory`;
    try {
      await deleteDoc(doc(db, path, itemId));
      setItems(prev => prev.filter(i => i.id !== itemId));

      // Register deletion log
      const logRef = doc(collection(db, `stores/${storeId}/inventory_logs`));
      await setDoc(logRef, {
        id: logRef.id,
        storeId,
        ownerId,
        ingredientId: itemId,
        ingredientName: name || 'Item Deletado',
        quantityChange: 0,
        type: 'adjustment',
        referenceName: 'Item excluído do estoque',
        createdAt: new Date().toISOString()
      });
      loadLogs();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${path}/${itemId}`);
    }
  };

  const handleAdjustQty = async (item: InventoryItem, delta: number) => {
    const path = `stores/${storeId}/inventory`;
    const newQty = Math.max(0, Number((item.quantity + delta).toFixed(2)));
    try {
      await updateDoc(doc(db, path, item.id), { quantity: newQty });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: newQty } : i));

      // Log movement
      const logRef = doc(collection(db, `stores/${storeId}/inventory_logs`));
      await setDoc(logRef, {
        id: logRef.id,
        storeId,
        ownerId,
        ingredientId: item.id,
        ingredientName: item.name,
        quantityChange: delta,
        type: 'adjustment',
        referenceName: 'Ajuste rápido de quantidade',
        createdAt: new Date().toISOString()
      });
      loadLogs();
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${path}/${item.id}`);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || quantity === '' || minStock === '') return;

    const path = `stores/${storeId}/inventory`;
    const id = editingItem ? editingItem.id : doc(collection(db, 'dummy')).id;

    const payload: InventoryItem = {
      id,
      storeId,
      ownerId,
      name,
      category,
      quantity: Number(quantity),
      unit,
      minStock: Number(minStock),
      notes,
      createdAt: editingItem ? editingItem.createdAt : new Date().toISOString()
    };

    try {
      await setDoc(doc(db, path, id), payload);

      // Audit logs
      const logRef = doc(collection(db, `stores/${storeId}/inventory_logs`));
      if (editingItem) {
        if (editingItem.quantity !== Number(quantity)) {
          const delta = Number(quantity) - editingItem.quantity;
          await setDoc(logRef, {
            id: logRef.id,
            storeId,
            ownerId,
            ingredientId: id,
            ingredientName: name,
            quantityChange: delta,
            type: 'adjustment',
            referenceName: 'Ajuste manual de edição',
            createdAt: new Date().toISOString()
          });
        }
      } else {
        await setDoc(logRef, {
          id: logRef.id,
          storeId,
          ownerId,
          ingredientId: id,
          ingredientName: name,
          quantityChange: Number(quantity),
          type: 'addition',
          referenceName: 'Cadastro inicial de ingrediente',
          createdAt: new Date().toISOString()
        });
      }

      await loadInventory();
      await loadLogs();
      setShowForm(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${path}/${id}`);
    }
  };

  // Add item to manual shopping list
  const handleAddShoppingItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!newShopItemName) return;

    const path = `stores/${storeId}/shopping_list`;
    const sId = doc(collection(db, 'dummy')).id;

    const newItem: ShoppingListItem = {
      id: sId,
      storeId,
      ownerId,
      name: newShopItemName,
      quantity: newShopItemQty ? Number(newShopItemQty) : 1,
      unit: newShopItemUnit,
      checked: false,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, path, sId), newItem);
      setCustomShoppingItems(prev => [...prev, newItem]);
      setNewShopItemName('');
      setNewShopItemQty('');
      setNewShopItemUnit('un');
    } catch (e) {
      console.error("Error saving shopping list item:", e);
    }
  };

  // Toggle checkout status of custom shopping items
  const handleToggleShoppingItem = async (item: ShoppingListItem) => {
    const path = `stores/${storeId}/shopping_list`;
    const updatedStatus = !item.checked;
    try {
      await updateDoc(doc(db, path, item.id), { checked: updatedStatus });
      setCustomShoppingItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: updatedStatus } : i));
    } catch (e) {
      console.error("Error updating shopping item:", e);
    }
  };

  // Delete item from shopping list
  const handleDeleteShoppingItem = async (itemId: string) => {
    const path = `stores/${storeId}/shopping_list`;
    try {
      await deleteDoc(doc(db, path, itemId));
      setCustomShoppingItems(prev => prev.filter(i => i.id !== itemId));
    } catch (e) {
      console.error("Error deleting shopping item:", e);
    }
  };

  // Format shopping list for copying/printing/sharing
  const getFormattedShoppingList = () => {
    // 1. Auto items (below min)
    const belowMinItems = items.filter(i => i.quantity <= i.minStock);
    let text = `🛒 *LISTA DE COMPRAS - CONFEITAPRO AI*\n`;
    text += `Gerada em: ${new Date().toLocaleDateString('pt-BR')}\n\n`;

    if (belowMinItems.length > 0) {
      text += `🚨 *FALTAS / ALERTA DE ESTOQUE MÍNIMO:*\n`;
      belowMinItems.forEach(item => {
        text += `• ${item.name}: estoque atual de ${item.quantity}${item.unit} (Mínimo: ${item.minStock}${item.unit})\n`;
      });
      text += `\n`;
    }

    const uncheckedCustoms = customShoppingItems.filter(i => !i.checked);
    if (uncheckedCustoms.length > 0) {
      text += `📝 *OUTROS ITENS COMPLEMENTARES:*\n`;
      uncheckedCustoms.forEach(item => {
        text += `• ${item.name} (${item.quantity} ${item.unit})\n`;
      });
    }

    return text;
  };

  // WhatsApp share
  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(getFormattedShoppingList());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // Quick print
  const handlePrint = () => {
    const printContent = getFormattedShoppingList().replace(/\*/g, '');
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`<pre style="font-family: sans-serif; padding: 20px; line-height: 1.6;">${printContent}</pre>`);
      win.document.close();
      win.print();
    }
  };

  // Filter items based on search query
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Below Stock alerts count
  const belowMinCount = items.filter(i => i.quantity <= i.minStock).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#4A3F35]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif italic text-[#4A3F35]">Painel de Insumos & Estoque</h2>
          <p className="text-sm text-[#A69C91]">Gerencie receitas, compras inteligentes, insumos e movimentações auditadas.</p>
        </div>
        
        {activeTab === 'stock' && (
          <button
            onClick={handleOpenCreate}
            className="bg-[#4A3F35] text-white font-bold text-sm px-5 py-3 rounded-xl hover:bg-[#5A4F44] transition flex items-center gap-2 shadow-xs"
          >
            <Plus className="w-4 h-4" /> Novo Ingrediente
          </button>
        )}
      </div>

      {/* Internal Navigation Sub-tabs */}
      <div className="flex items-center gap-3 border-b border-[#EBE9E1]/60 pb-1 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 ${
            activeTab === 'stock'
              ? 'border-[#4A3F35] text-[#4A3F35]'
              : 'border-transparent text-[#A69C91] hover:text-[#4A3F35]'
          }`}
        >
          <Layers className="w-4 h-4" /> Controle de Estoque
        </button>
        <button
          onClick={() => setActiveTab('shopping')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 relative ${
            activeTab === 'shopping'
              ? 'border-[#4A3F35] text-[#4A3F35]'
              : 'border-transparent text-[#A69C91] hover:text-[#4A3F35]'
          }`}
        >
          <ShoppingCart className="w-4 h-4" /> Lista de Compras
          {belowMinCount > 0 && (
            <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full absolute -top-1 -right-1">
              {belowMinCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 ${
            activeTab === 'history'
              ? 'border-[#4A3F35] text-[#4A3F35]'
              : 'border-transparent text-[#A69C91] hover:text-[#4A3F35]'
          }`}
        >
          <History className="w-4 h-4" /> Histórico de Movimentações
        </button>
      </div>

      {/* TAB CONTENT: STOCK CONTROLS */}
      {activeTab === 'stock' && (
        <div className="space-y-6 animate-fade-in">
          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-[#A69C91] absolute left-4 top-3.5" />
            <input
              type="text"
              placeholder="Buscar ingrediente ou categoria..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 text-sm bg-white border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] outline-none transition"
            />
          </div>

          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-[2rem] border border-[#EBE9E1] p-12 text-center max-w-lg mx-auto space-y-6">
              <ClipboardList className="w-12 h-12 text-[#D4A373] mx-auto" />
              <div>
                <h3 className="font-bold text-[#4A3F35] text-lg">Nenhum insumo localizado</h3>
                <p className="text-sm text-[#A69C91] mt-1">Experimente cadastrar farinha, ovos, leite condensado ou mude sua busca.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-[#EBE9E1] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F2EB]/40 border-b border-[#EBE9E1] text-[#A69C91] font-bold text-[10px] tracking-wider uppercase">
                      <th className="py-4 px-6">Ingrediente</th>
                      <th className="py-4 px-4">Categoria</th>
                      <th className="py-4 px-4 text-center">Quantidade Atual</th>
                      <th className="py-4 px-4 text-center">Ajuste Rápido</th>
                      <th className="py-4 px-4 text-center">Mínimo de Segurança</th>
                      <th className="py-4 px-4 text-center">Status</th>
                      <th className="py-4 px-6 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBE9E1]/35 text-sm">
                    {filteredItems.map((item) => {
                      const isLow = item.quantity <= item.minStock;

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-[#FAF9F6]/55 transition ${
                            isLow ? 'bg-red-50/20' : ''
                          }`}
                        >
                          <td className="py-4 px-6">
                            <p className="font-semibold text-[#4A3F35]">{item.name}</p>
                            {item.notes && <p className="text-[10px] text-gray-400 italic mt-0.5 max-w-xs truncate">{item.notes}</p>}
                          </td>
                          <td className="py-4 px-4">
                            <span className="inline-block bg-[#F5F2EB] text-[#4A3F35] font-semibold text-[10px] px-2.5 py-1 rounded-lg">
                              {item.category || 'Ingredientes'}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center font-bold text-[#4A3F35]">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAdjustQty(item, -50)}
                                className="text-[#A69C91] hover:text-[#D4A373] transition"
                                title="-50"
                              >
                                <MinusCircle className="w-5 h-5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustQty(item, -10)}
                                className="text-[#A69C91] hover:text-[#D4A373] transition"
                                title="-10"
                              >
                                <MinusCircle className="w-4 h-4" />
                              </button>
                              <span className="text-xs text-[#EBE9E1]">/</span>
                              <button
                                type="button"
                                onClick={() => handleAdjustQty(item, 10)}
                                className="text-[#A69C91] hover:text-[#D4A373] transition"
                                title="+10"
                              >
                                <PlusCircle className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustQty(item, 50)}
                                className="text-[#A69C91] hover:text-[#D4A373] transition"
                                title="+50"
                              >
                                <PlusCircle className="w-5 h-5" />
                              </button>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center text-[#A69C91] font-medium">
                            {item.minStock} {item.unit}
                          </td>
                          <td className="py-4 px-4 text-center">
                            {isLow ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 uppercase tracking-wider">
                                <AlertTriangle className="w-3.5 h-3.5" /> Comprar!
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 uppercase tracking-wider">
                                Suficiente
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEdit(item)}
                                className="p-2 text-[#A69C91] hover:text-[#4A3F35] hover:bg-[#F5F2EB]/50 rounded-xl transition"
                                title="Editar"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="p-2 text-[#A69C91] hover:text-[#EF4444] hover:bg-red-50 rounded-xl transition"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: SHOPPING LIST */}
      {activeTab === 'shopping' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          {/* Main Shopping list panel */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-[2rem] border border-[#EBE9E1] p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="font-serif italic text-xl text-[#4A3F35]">Minha Lista de Compras</h3>
                  <p className="text-xs text-[#A69C91]">Itens calculados de forma inteligente abaixo do mínimo + itens personalizados.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleShareWhatsApp}
                    className="p-2.5 bg-green-50 text-green-700 border border-green-100 rounded-xl hover:bg-green-100 transition"
                    title="Compartilhar no WhatsApp"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handlePrint}
                    className="p-2.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl hover:bg-blue-100 transition"
                    title="Imprimir Lista"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* AUTOMATIC ALERTS BELOW MINIMUM */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Faltas Recomendadas pelo Sistema
                </h4>
                {items.filter(i => i.quantity <= i.minStock).length === 0 ? (
                  <p className="text-xs text-gray-400 italic bg-[#FAF9F6] p-4 rounded-xl text-center">Nenhum produto está abaixo do limite de segurança. Excelente trabalho!</p>
                ) : (
                  <div className="space-y-2">
                    {items.filter(i => i.quantity <= i.minStock).map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-red-50/20 border border-red-100/50 p-3.5 rounded-xl text-xs">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-red-950">{item.name}</span>
                          <p className="text-[10px] text-red-700">Mínimo necessário: {item.minStock}{item.unit} / Em estoque: <strong className="font-bold">{item.quantity}{item.unit}</strong></p>
                        </div>
                        <span className="bg-red-100 text-red-800 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase">Comprar Urgente!</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CUSTOM SHOPPING ITEMS */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <h4 className="text-[10px] font-bold text-[#A69C91] uppercase tracking-widest flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5 text-[#D4A373]" /> Outros Insumos e Embalagens
                </h4>

                {customShoppingItems.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-4">Nenhum item manual adicionado. Use o formulário lateral para planejar compras extras.</p>
                ) : (
                  <div className="space-y-2">
                    {customShoppingItems.map(item => (
                      <div 
                        key={item.id} 
                        className={`flex items-center justify-between border p-3 rounded-xl text-xs transition ${
                          item.checked 
                            ? 'bg-stone-50/50 border-stone-200/40 text-stone-400 line-through' 
                            : 'bg-[#FAF9F6]/55 border-[#EBE9E1]/50 text-[#4A3F35]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleToggleShoppingItem(item)}
                            className="text-[#D4A373] hover:scale-105 transition"
                          >
                            {item.checked ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5" />}
                          </button>
                          <div>
                            <span className="font-semibold">{item.name}</span>
                            <span className="ml-1.5 text-[10px] font-bold text-[#A69C91]">({item.quantity} {item.unit})</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteShoppingItem(item.id)}
                          className="text-stone-300 hover:text-red-500 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Lateral addition panel */}
          <div className="bg-white rounded-[2rem] border border-[#EBE9E1] p-8 space-y-6 h-fit">
            <div className="space-y-1">
              <h4 className="font-serif italic text-lg text-[#4A3F35]">Adicionar Item</h4>
              <p className="text-xs text-[#A69C91]">Insira suprimentos que não fazem parte do estoque padrão (ex: fitas, bandejas).</p>
            </div>

            <form onSubmit={handleAddShoppingItem} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Nome do Item *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Forminhas Nº 4"
                  value={newShopItemName}
                  onChange={(e) => setNewShopItemName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={newShopItemQty}
                    onChange={(e) => setNewShopItemQty(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Unidade</label>
                  <select
                    value={newShopItemUnit}
                    onChange={(e) => setNewShopItemUnit(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl outline-none"
                  >
                    <option value="un">Unidade (un)</option>
                    <option value="pct">Pacote (pct)</option>
                    <option value="cx">Caixa (cx)</option>
                    <option value="g">Gramas (g)</option>
                    <option value="kg">Quilos (kg)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#4A3F35] text-white font-bold text-xs py-3 rounded-xl hover:bg-[#5A4F44] transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Adicionar na Lista
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB CONTENT: MOVEMENT LOGS */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-[2rem] border border-[#EBE9E1] p-8 space-y-6 animate-fade-in">
          <div>
            <h3 className="font-serif italic text-xl text-[#4A3F35]">Auditoria & Histórico de Movimentações</h3>
            <p className="text-xs text-[#A69C91]">Acompanhe de forma transparente todas as entradas, baixas inteligentes e ajustes manuais.</p>
          </div>

          {logs.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-8">Nenhuma movimentação de estoque registrada ainda.</p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {logs.map((log) => {
                const date = new Date(log.createdAt);
                const isPositive = log.quantityChange > 0;
                const isDeduction = log.type === 'deduction';

                return (
                  <div key={log.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-[#FAF9F6]/50 border border-[#EBE9E1]/30 rounded-2xl gap-3 text-xs text-[#4A3F35]">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-800">{log.ingredientName}</span>
                        <span className={`inline-block px-2 py-0.5 text-[8px] font-bold rounded-md uppercase ${
                          isDeduction 
                            ? 'bg-red-50 text-red-700' 
                            : log.type === 'addition'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-stone-100 text-stone-700'
                        }`}>
                          {log.type === 'deduction' ? 'Baixa Inteligente' : log.type === 'addition' ? 'Entrada' : 'Ajuste'}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#A69C91]">Origem: <strong className="text-stone-700">{log.referenceName || 'Ajuste Geral'}</strong></p>
                    </div>

                    <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2">
                      <span className={`font-mono font-bold text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? '+' : ''}{log.quantityChange}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {date.toLocaleDateString('pt-BR')} às {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FORM MODAL: CREATE OR EDIT INVENTORY ITEM */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-[2rem] border border-[#EBE9E1] w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 border-b border-[#FAF9F6] flex items-center justify-between bg-[#FAF9F6]/50">
              <h3 className="text-lg font-serif italic text-[#4A3F35]">
                {editingItem ? 'Editar Insumo' : 'Novo Ingrediente'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-[#F5F2EB] rounded-xl text-[#A69C91] hover:text-[#4A3F35] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider">Nome do Ingrediente *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Leite Condensado Moça"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider">Categoria *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
                >
                  <option value="Ingredientes">Ingredientes Básicos</option>
                  <option value="Recheios">Recheios e Coberturas</option>
                  <option value="Embalagens">Embalagens e Fitas</option>
                  <option value="Frutas">Frutas e Frescos</option>
                  <option value="Outros">Outros Extras</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider">Quantidade Atual *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider">Unidade</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
                  >
                    <option value="g">Gramas (g)</option>
                    <option value="kg">Quilos (kg)</option>
                    <option value="un">Unidade (un)</option>
                    <option value="ml">Mililitros (ml)</option>
                    <option value="l">Litros (l)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider">Limite Mínimo de Segurança *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="Se atingir este valor, acenderá o alerta de compra"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider">Observações / Marca Recomendada</label>
                <textarea
                  placeholder="Ex: Preferência por Nestlé ou Itambé."
                  value={notes}
                  rows={2}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition resize-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-6 border-t border-[#FAF9F6]">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-3 bg-stone-100 text-[#4A3F35] font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-stone-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-[#4A3F35] text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-[#5A4F44] transition-all"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
