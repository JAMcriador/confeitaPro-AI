import { useState, useEffect, FormEvent, MouseEvent } from 'react';
import { db, handleFirestoreError, OperationType, collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc } from '../firebase';
import { StoreConfig, Product, Order, OrderItem } from '../types';
import { PRESET_AVATARS, PRESET_COVERS } from '../utils/assets';
import { 
  ShoppingBag, 
  Clock, 
  MapPin, 
  Phone, 
  Instagram, 
  Calendar, 
  Trash2, 
  CheckCircle, 
  MessageSquare, 
  Plus, 
  Minus, 
  X, 
  Info,
  ChevronRight,
  MessageCircle
} from 'lucide-react';

interface PublicStoreViewProps {
  slug: string;
}

export default function PublicStoreView({ slug }: PublicStoreViewProps) {
  const [store, setStore] = useState<StoreConfig | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cart, setCart] = useState<OrderItem[]>([]);
  
  // Checkout Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryDateTime, setDeliveryDateTime] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Selected Product for Details Modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [detailObservation, setDetailObservation] = useState('');

  // Submit states
  const [submitting, setSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);

  // Filter category
  const [selectedCategory, setSelectedCategory] = useState('Todos');

  useEffect(() => {
    async function loadStoreAndProducts() {
      try {
        setLoading(true);
        setLoadError(null);
        
        let storeData: StoreConfig | null = null;
        let storeIdToUse = "";

        // 1. Try direct get by document ID (extremely fast, permission-safe, no index required)
        try {
          const directStoreSnap = await getDoc(doc(db, 'stores', slug));
          if (directStoreSnap.exists()) {
            storeData = { id: directStoreSnap.id, ...directStoreSnap.data() } as StoreConfig;
            storeIdToUse = directStoreSnap.id;
            console.log(`[PublicStoreView] Successfully loaded store by direct ID: "${slug}"`);
          }
        } catch (directErr) {
          console.warn("[PublicStoreView] Direct store ID get failed, trying fallback query:", directErr);
        }

        // 2. Fallback to query by slug field (in case document ID doesn't match slug field)
        if (!storeData) {
          const storeQuery = query(collection(db, 'stores'), where('slug', '==', slug));
          const storeSnap = await getDocs(storeQuery);

          if (!storeSnap.empty) {
            const storeDoc = storeSnap.docs[0];
            storeData = { id: storeDoc.id, ...storeDoc.data() } as StoreConfig;
            storeIdToUse = storeDoc.id;
            console.log(`[PublicStoreView] Loaded store by fallback slug query: "${slug}"`);
          }
        }

        if (!storeData) {
          setStore(null);
          setLoading(false);
          return;
        }

        setStore(storeData);

        // 3. Load active products of this store directly via secure query
        const productsQuery = query(collection(db, `stores/${storeIdToUse}/products`), where('active', '==', true));
        const productsSnap = await getDocs(productsQuery);
        const prodList: Product[] = [];
        productsSnap.forEach((doc) => {
          prodList.push({ id: doc.id, ...doc.data() } as Product);
        });
        
        console.log(`[PublicStoreView] Loaded ${prodList.length} active products for store: "${storeIdToUse}"`);
        setProducts(prodList);
      } catch (error: any) {
        console.error("Error loading public store data:", error);
        setLoadError(error?.message || String(error));
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      loadStoreAndProducts();
    }
  }, [slug]);

  // Add simple item (from card direct button)
  const handleAddToCart = (product: Product, e: MouseEvent) => {
    e.stopPropagation(); // Avoid opening the detailed modal
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id && !item.notes);
      if (existing) {
        return prev.map(item =>
          (item.productId === product.id && !item.notes) ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1, notes: '' }];
    });
  };

  // Add custom detailed item (from details modal)
  const handleAddToCartDetailed = () => {
    if (!selectedProduct) return;
    setCart(prev => {
      const existingIndex = prev.findIndex(item => item.productId === selectedProduct.id && item.notes === detailObservation);
      if (existingIndex > -1) {
        return prev.map((item, index) =>
          index === existingIndex ? { ...item, quantity: item.quantity + detailQuantity } : item
        );
      }
      return [...prev, { 
        productId: selectedProduct.id, 
        name: selectedProduct.name, 
        price: selectedProduct.price, 
        quantity: detailQuantity, 
        notes: detailObservation 
      }];
    });
    setSelectedProduct(null);
    setDetailQuantity(1);
    setDetailObservation('');
  };

  const handleUpdateQty = (productId: string, notesKey: string | undefined, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.productId === productId && item.notes === (notesKey || '')) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as OrderItem[];
    });
  };

  const handleRemoveItem = (productId: string, notesKey: string | undefined) => {
    setCart(prev => prev.filter(item => !(item.productId === productId && item.notes === (notesKey || ''))));
  };

  const handleSubmitOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!store || cart.length === 0 || !customerName || !customerPhone || !deliveryDateTime) return;
    if (deliveryType === 'delivery' && !address) {
      alert("Por favor, preencha o endereço de entrega.");
      return;
    }

    try {
      setSubmitting(true);
      const orderId = doc(collection(db, 'dummy')).id;
      const orderNumber = `#C${Math.floor(1000 + Math.random() * 9000)}`;
      const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

      // Save complete delivery information inside notes field to comply with firestore schema
      const finalNotes = deliveryType === 'delivery' 
        ? `ENDEREÇO DE ENTREGA: ${address}${notes ? ` | Observações: ${notes}` : ''}`
        : notes;

      const orderPayload: Order = {
        id: orderId,
        storeId: store.id,
        ownerId: store.ownerId,
        orderNumber,
        customerName,
        customerPhone,
        deliveryType,
        deliveryDateTime,
        notes: finalNotes,
        items: cart,
        total,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const path = `stores/${store.id}/orders`;
      await setDoc(doc(db, path, orderId), orderPayload);

      // AUTOMATED STOCK MANAGEMENT RULES
      try {
        const inventorySnap = await getDocs(collection(db, `stores/${store.id}/inventory`));
        const inventoryList: any[] = [];
        inventorySnap.forEach(d => {
          inventoryList.push({ id: d.id, ...d.data() });
        });

        for (const cartItem of cart) {
          const matchedProd = products.find(p => p.id === cartItem.productId);
          const searchableText = `${cartItem.name} ${matchedProd?.description || ''}`.toLowerCase();

          for (const invItem of inventoryList) {
            const ingredientName = invItem.name.toLowerCase();
            const isWordMatch = ingredientName.split(' ').some((word: string) => word.length > 3 && searchableText.includes(word));
            const isSubMatch = searchableText.includes(ingredientName) || ingredientName.includes(cartItem.name.toLowerCase());

            if (isWordMatch || isSubMatch) {
              let portion = 1.0;
              if (invItem.unit === 'g' || invItem.unit === 'ml') {
                portion = 150.0;
              } else if (invItem.unit === 'kg' || invItem.unit === 'l') {
                portion = 0.15;
              } else if (invItem.unit === 'un' || invItem.unit === 'pct') {
                portion = 2.0;
              }

              const totalDeducted = portion * cartItem.quantity;
              const nextQty = Math.max(0, invItem.quantity - totalDeducted);

              await updateDoc(doc(db, `stores/${store.id}/inventory`, invItem.id), {
                quantity: Number(nextQty.toFixed(3))
              });
            }
          }
        }
      } catch (invErr) {
        console.error("Auto inventory deduction failed:", invErr);
      }

      setSubmittedOrder(orderPayload);
      setCart([]);
    } catch (err) {
      console.error("Error placing order:", err);
      alert("Houve um erro ao enviar sua encomenda. Por favor, tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const sendWhatsAppDirectSummary = () => {
    if (!submittedOrder || !store) return;

    const itemsText = submittedOrder.items
      .map(item => {
        let text = `• ${item.quantity}x ${item.name} (${item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`;
        if (item.notes) {
          text += `\n  ↳ Obs: _"${item.notes}"_`;
        }
        return text;
      })
      .join('\n');

    const dateObj = new Date(submittedOrder.deliveryDateTime);
    const dateFormatted = isNaN(dateObj.getTime()) 
      ? submittedOrder.deliveryDateTime 
      : dateObj.toLocaleDateString('pt-BR');
    
    const timeFormatted = isNaN(dateObj.getTime()) 
      ? '' 
      : dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const message = encodeURIComponent(
      `🧁 *NOVO PEDIDO - CONFEITAPRO*\n\n` +
      `*Pedido:* ${submittedOrder.orderNumber}\n` +
      `*Cliente:* ${submittedOrder.customerName}\n` +
      `*Telefone:* ${submittedOrder.customerPhone}\n\n` +
      `*Itens Encomendados:* \n${itemsText}\n\n` +
      `*Total Geral:* ${submittedOrder.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n` +
      `*Agendado para:* ${dateFormatted} ${timeFormatted ? `às ${timeFormatted}` : ''}\n` +
      `*Modo:* ${submittedOrder.deliveryType === 'delivery' ? '🚗 Entrega no Endereço' : '🛍️ Retirada no Balcão'}\n` +
      `*Observações:* ${submittedOrder.notes || 'Nenhuma.'}\n\n` +
      `Agradeço a preferência e aguardo a aprovação! ✨`
    );

    const cleanStorePhone = store.whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/55${cleanStorePhone}?text=${message}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAF9F6]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#D4A373]"></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[#FAF9F6] text-center">
        <div className="p-4 bg-[#FAD2E1] text-[#E56B6F] rounded-full w-16 h-16 flex items-center justify-center mb-6">
          <Info className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#4A3F35]">Falha na conexão com a Confeitaria</h2>
        <p className="text-[#A69C91] text-sm max-w-sm mt-2 leading-relaxed">Não foi possível carregar as informações desta confeitaria devido a um erro de permissão ou rede.</p>
        <div className="mt-4 p-4 bg-[#FAF9F6] rounded-xl border border-[#EBE9E1] font-mono text-[10px] text-stone-500 max-w-sm text-left select-all overflow-x-auto w-full">
          <strong>Código do Erro:</strong> {loadError}
        </div>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-8 bg-[#4A3F35] hover:bg-[#5A4F44] text-white font-bold text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl transition-all shadow-sm"
        >
          Recarregar Página
        </button>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[#FAF9F6] text-center">
        <div className="p-4 bg-[#F5F2EB] text-[#D4A373] rounded-full w-16 h-16 flex items-center justify-center mb-6">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#4A3F35]">Confeitaria não encontrada</h2>
        <p className="text-[#A69C91] text-sm max-w-sm mt-2 leading-relaxed">O link acessado é inválido ou esta loja não está mais cadastrada em nossa plataforma ConfeitaPro AI.</p>
        <a href="/" className="mt-8 bg-[#4A3F35] hover:bg-[#5A4F44] text-white font-bold text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl transition-all shadow-sm">
          Ir para ConfeitaPro AI
        </a>
      </div>
    );
  }

  // Categories
  const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category || 'Outros')))];

  const filteredProducts = products.filter(p => {
    if (selectedCategory === 'Todos') return true;
    return p.category === selectedCategory;
  });

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Success view
  if (submittedOrder) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4">
        <div className="bg-white rounded-[2rem] max-w-md w-full p-8 text-center border border-[#EBE9E1] shadow-xl space-y-6">
          <div className="w-16 h-16 bg-[#E9EDC6] text-[#5A5A40] rounded-full flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle className="w-10 h-10" />
          </div>
          <div className="space-y-3">
            <h3 className="text-2xl font-serif italic text-[#4A3F35] leading-none">Encomenda Registrada!</h3>
            <p className="text-xs text-[#A69C91] font-medium px-2 leading-normal">
              Sua encomenda foi enviada para o painel de produção da <span className="font-bold text-[#4A3F35]">{store.name}</span>. Envie os detalhes por WhatsApp para confirmar.
            </p>
            <span className="inline-block px-4 py-1.5 bg-[#FAF9F6] text-[#D4A373] border border-[#EBE9E1] font-mono font-bold rounded-lg text-xs uppercase tracking-wider mt-1">
              Código: {submittedOrder.orderNumber}
            </span>
          </div>

          <div className="bg-[#FAF9F6] rounded-2xl p-5 text-left text-xs space-y-3 border border-[#EBE9E1]/50">
            <p className="font-bold text-[#A69C91] tracking-wider text-[9px] uppercase">Resumo da Encomenda</p>
            <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
              {submittedOrder.items.map((item, i) => (
                <div key={i} className="text-[#4A3F35] font-semibold border-b border-[#EBE9E1]/30 pb-2 last:border-0 last:pb-0">
                  <div className="flex justify-between">
                    <span>{item.quantity}x {item.name}</span>
                    <span className="text-[#A69C91]">{(item.price * item.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                  {item.notes && (
                    <p className="text-[10px] text-[#A69C91] font-normal italic mt-0.5">↳ Observação: "{item.notes}"</p>
                  )}
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-[#EBE9E1]/60 flex justify-between font-bold text-[#4A3F35] text-sm">
              <span>Total Estimado</span>
              <span className="text-[#D4A373] font-serif font-bold text-base">{submittedOrder.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={sendWhatsAppDirectSummary}
              className="w-full bg-[#E9EDC6] hover:bg-[#d9ddb6] text-[#5A5A40] border border-[#d2d7ad] font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs"
            >
              <MessageCircle className="w-5 h-5 text-[#5A5A40] fill-current" /> Enviar Detalhes pelo WhatsApp
            </button>
            <button
              onClick={() => setSubmittedOrder(null)}
              className="w-full bg-stone-100 hover:bg-stone-200 text-[#4A3F35] font-bold py-2.5 px-4 rounded-xl text-xs transition-all"
            >
              Voltar ao Cardápio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-20">
      
      {/* Cover Banner */}
      <div className="relative h-60 sm:h-72 bg-zinc-200">
        <img
          src={store.coverUrl || PRESET_COVERS[0].url}
          alt={store.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#FAF9F6] to-transparent opacity-80" />
      </div>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 -mt-24 relative z-10 space-y-8">
        
        {/* Profile Confectioner Details Header Card */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-[#EBE9E1] shadow-sm flex flex-col md:flex-row items-center md:items-end justify-between gap-6">
          <div className="flex flex-col md:flex-row items-center gap-5 text-center md:text-left">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-[1.5rem] border-4 border-white bg-white overflow-hidden shadow-md flex-shrink-0">
              <img src={store.logoUrl || PRESET_AVATARS[0].url} alt={store.name} className="w-full h-full object-cover" />
            </div>
            <div className="space-y-1.5 pt-2">
              <h1 className="text-3xl sm:text-4xl font-serif italic text-[#4A3F35] tracking-tight leading-none">{store.name}</h1>
              <p className="text-[#A69C91] text-xs sm:text-sm max-w-xl leading-relaxed font-medium">{store.description || 'Bem-vindo ao nosso cardápio de encomendas de doces e bolos gourmet!'}</p>
              
              {/* Info Details Pills */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 text-xs text-[#A69C91] pt-1.5 font-semibold">
                {store.workingHours && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-[#D4A373]" /> {store.workingHours}
                  </span>
                )}
                {store.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-[#D4A373]" /> {store.address}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Socials buttons & Explicit Falar WhatsApp */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
            {store.whatsapp && (
              <a
                href={`https://wa.me/55${store.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="bg-[#E9EDC6] hover:bg-[#d9ddb6] text-[#5A5A40] border border-[#d2d7ad] font-bold text-xs px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs uppercase tracking-wider"
              >
                <MessageCircle className="w-4.5 h-4.5 text-[#5A5A40] fill-current" /> Falar no WhatsApp
              </a>
            )}
            {store.instagram && (
              <a
                href={`https://instagram.com/${store.instagram.replace('@', '')}`}
                target="_blank"
                rel="noreferrer"
                className="p-3.5 bg-white text-[#D4A373] hover:text-[#4A3F35] hover:bg-[#FAF9F6] rounded-xl transition border border-[#EBE9E1] flex items-center justify-center"
                title="Siga no Instagram"
              >
                <Instagram className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>

        {/* Content Section Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Side: Dynamic Catalog Area (8 Columns) */}
          <div className="lg:col-span-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EBE9E1]/60 pb-3">
              <h3 className="font-serif italic text-[#4A3F35] text-2xl">Catálogo Delícias</h3>
              
              {/* Scrollable category pills */}
              <div className="flex gap-1.5 overflow-x-auto max-w-full sm:max-w-sm scrollbar-none pb-1">
                {categories.map(cat => {
                  const isActive = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                        isActive 
                          ? 'bg-[#4A3F35] text-white shadow-xs' 
                          : 'bg-white text-[#A69C91] border border-[#EBE9E1] hover:text-[#4A3F35] hover:bg-[#FAF9F6]'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Menu Products Grid */}
            {filteredProducts.length === 0 ? (
              <div className="bg-white rounded-[2rem] p-12 text-center border border-[#EBE9E1] text-[#A69C91] font-semibold text-sm shadow-xs">
                Nenhum doce ativo nesta categoria no momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredProducts.map((prod) => (
                  <div 
                    key={prod.id} 
                    onClick={() => {
                      setSelectedProduct(prod);
                      setDetailQuantity(1);
                      setDetailObservation('');
                    }}
                    className="bg-white rounded-[1.5rem] border border-[#EBE9E1] p-4 shadow-sm hover:shadow-md transition-all duration-300 flex gap-4 cursor-pointer hover:border-[#D4A373]/40 group"
                  >
                    {/* Product picture */}
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-[#FAF9F6] border border-[#EBE9E1]/30 overflow-hidden flex-shrink-0">
                      <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                    </div>
                    
                    {/* Information */}
                    <div className="flex-1 flex flex-col justify-between py-0.5">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between">
                          <h4 className="font-bold text-[#4A3F35] text-sm leading-snug group-hover:text-[#D4A373] transition-colors">{prod.name}</h4>
                        </div>
                        <p className="text-[#A69C91] text-[11px] line-clamp-2 leading-relaxed font-medium">{prod.description || 'Ingredientes finamente selecionados pela confeiteira.'}</p>
                      </div>

                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex flex-col">
                          <span className="text-[#D4A373] font-serif font-bold text-base leading-none">
                            {prod.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                          {prod.productionTime > 0 && (
                            <span className="text-[9px] text-[#A69C91] font-bold uppercase mt-1">⏱️ {prod.productionTime} min</span>
                          )}
                        </div>

                        {/* Order action button */}
                        <button
                          type="button"
                          onClick={(e) => handleAddToCart(prod, e)}
                          className="bg-[#4A3F35] hover:bg-[#5A4F44] text-white font-bold text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all flex items-center gap-1 shadow-xs"
                        >
                          <Plus className="w-3 h-3" /> Adicionar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Side: Responsive Cart Checkout Column (4 Columns) */}
          <div className="lg:col-span-4 bg-white rounded-[2rem] border border-[#EBE9E1] p-6 shadow-sm space-y-6">
            <h3 className="font-serif text-[#4A3F35] text-xl flex items-center gap-2">
              <ShoppingBag className="w-5.5 h-5.5 text-[#D4A373]" /> Sacola de Encomendas
            </h3>

            {cart.length === 0 ? (
              <div className="text-center py-12 text-[#A69C91] text-xs space-y-3">
                <ShoppingBag className="w-10 h-10 mx-auto text-[#EBE9E1]" />
                <p className="font-bold text-[#4A3F35]/70 text-sm">Sua sacola de doces está vazia.</p>
                <p className="text-[10px] text-[#A69C91] px-4 leading-normal">Escolha as delícias ao lado e configure as observações para adicionar aqui.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitOrder} className="space-y-6">
                
                {/* Scrollable list of items added to cart */}
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {cart.map((item, index) => (
                    <div key={`${item.productId}-${index}`} className="text-xs border-b border-[#FAF9F6] pb-3 last:border-0 last:pb-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="font-bold text-[#4A3F35] leading-snug">{item.name}</p>
                          <p className="text-[#A69C91] font-bold">{item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        
                        {/* Remove item button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.productId, item.notes)}
                          className="text-[#A69C91] hover:text-red-500 transition-all p-0.5"
                          title="Remover item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {item.notes && (
                        <p className="text-[10px] bg-[#FAF9F6] p-1.5 rounded-md border border-[#EBE9E1]/40 text-[#A69C91] font-medium leading-normal italic">
                          ↳ Obs: "{item.notes}"
                        </p>
                      )}

                      {/* Quantity Selector inside cart item */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] font-bold text-[#A69C91]/80 uppercase">Subtotal: {((item.price) * item.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        <div className="flex items-center gap-1.5 bg-[#F5F2EB] p-1 rounded-lg">
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(item.productId, item.notes, -1)}
                            className="text-[#4A3F35] hover:text-[#D4A373] transition-all p-0.5"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-[#4A3F35] w-5 text-center text-xs">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(item.productId, item.notes, 1)}
                            className="text-[#4A3F35] hover:text-[#D4A373] transition-all p-0.5"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shipping & Delivery Options */}
                <div className="space-y-4 border-t border-[#FAF9F6] pt-4">
                  <p className="font-bold text-[#A69C91] text-[10px] tracking-wider uppercase">Dados de Entrega & Envio</p>
                  
                  {/* Delivery / Pickup tab selector */}
                  <div className="grid grid-cols-2 gap-1 bg-[#F5F2EB] p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setDeliveryType('pickup')}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${
                        deliveryType === 'pickup' ? 'bg-white text-[#4A3F35] shadow-xs' : 'text-[#A69C91] hover:text-[#4A3F35]'
                      }`}
                    >
                      🛍️ Retirada
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryType('delivery')}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${
                        deliveryType === 'delivery' ? 'bg-white text-[#4A3F35] shadow-xs' : 'text-[#A69C91] hover:text-[#4A3F35]'
                      }`}
                    >
                      🚗 Entrega
                    </button>
                  </div>

                  {/* Delivery / Pickup address prompt */}
                  {deliveryType === 'delivery' && (
                    <div className="space-y-1.5 animate-fadeIn">
                      <label className="text-[10px] font-bold text-[#A69C91] block uppercase tracking-wider">Endereço Completo de Entrega *</label>
                      <input
                        type="text"
                        required
                        placeholder="Rua, número, bairro, complemento..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-xs bg-[#FAF9F6] border border-[#EBE9E1] rounded-lg outline-none focus:border-[#D4A373] focus:bg-white transition"
                      />
                    </div>
                  )}

                  {/* Date and hour picker */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[#A69C91] block uppercase tracking-wider">Agendar Data & Horário *</label>
                    <input
                      type="datetime-local"
                      required
                      value={deliveryDateTime}
                      onChange={(e) => setDeliveryDateTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-[#FAF9F6] border border-[#EBE9E1] rounded-lg outline-none focus:border-[#D4A373] focus:bg-white transition"
                    />
                  </div>

                  {/* Customer details */}
                  <div className="space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#A69C91] block uppercase tracking-wider">Seu Nome *</label>
                      <input
                        type="text"
                        required
                        placeholder="Nome completo para identificação"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-xs bg-[#FAF9F6] border border-[#EBE9E1] rounded-lg outline-none focus:border-[#D4A373] focus:bg-white transition"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#A69C91] block uppercase tracking-wider">WhatsApp com DDD *</label>
                      <input
                        type="tel"
                        required
                        placeholder="Ex: 11999999999"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-xs bg-[#FAF9F6] border border-[#EBE9E1] rounded-lg outline-none focus:border-[#D4A373] focus:bg-white transition"
                      />
                    </div>
                  </div>

                  {/* Notes / General Observations */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[#A69C91] block uppercase tracking-wider">Observações Gerais</label>
                    <textarea
                      rows={2}
                      placeholder="Ex: Deixar na portaria..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-[#FAF9F6] border border-[#EBE9E1] rounded-lg outline-none focus:border-[#D4A373] focus:bg-white transition resize-none"
                    />
                  </div>
                </div>

                {/* Subtotal Checkout actions */}
                <div className="border-t border-[#FAF9F6] pt-4 space-y-4">
                  <div className="flex justify-between items-center text-sm font-bold text-[#4A3F35]">
                    <span>Total Encomenda</span>
                    <span className="text-[#D4A373] font-serif font-bold text-xl">
                      {cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-[#4A3F35] hover:bg-[#5A4F44] text-white font-bold py-3.5 rounded-xl text-xs transition-all uppercase tracking-wider shadow-sm disabled:opacity-50"
                  >
                    {submitting ? 'Registrando Encomenda...' : 'Confirmar & Finalizar Pedido'}
                  </button>
                </div>

              </form>
            )}
          </div>

        </div>
      </div>

      {/* PRODUCT DETAILS POPUP OVERLAY MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-[#4A3F35]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-[#EBE9E1] max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-slideUp">
            
            {/* Image banner details header */}
            <div className="relative h-48 sm:h-56 bg-stone-100">
              <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-full object-cover" />
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 right-4 bg-white/90 hover:bg-white border border-[#EBE9E1] text-[#4A3F35] p-1.5 rounded-xl transition shadow-xs"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content info popup form */}
            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1">
              <div className="space-y-2">
                <span className="px-2.5 py-1 bg-[#FAF9F6] border border-[#EBE9E1] text-[#D4A373] font-bold text-[9px] uppercase tracking-wider rounded-md inline-block">{selectedProduct.category || 'Confeitaria'}</span>
                <h3 className="text-2xl font-serif italic text-[#4A3F35] leading-none">{selectedProduct.name}</h3>
                <p className="text-sm font-serif font-bold text-[#D4A373]">{selectedProduct.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
              </div>

              {/* Description & metadata info banner */}
              <div className="space-y-4">
                <p className="text-[#A69C91] text-xs leading-relaxed font-medium">{selectedProduct.description || 'Nenhum detalhe adicional fornecido.'}</p>
                
                {selectedProduct.productionTime > 0 && (
                  <div className="flex items-center gap-2 p-3.5 bg-[#FAF9F6] border border-[#EBE9E1]/50 rounded-xl text-xs text-[#A69C91] font-semibold">
                    <Clock className="w-4.5 h-4.5 text-[#D4A373]" />
                    <span>Tempo de Produção: <strong className="text-[#4A3F35]">{selectedProduct.productionTime} minutos</strong></span>
                  </div>
                )}
              </div>

              {/* Quantity input selectors */}
              <div className="space-y-2.5 pt-2 border-t border-[#EBE9E1]/50">
                <label className="text-[10px] font-bold text-[#A69C91] block uppercase tracking-wider">Selecione a Quantidade</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 bg-[#FAF9F6] border border-[#EBE9E1] p-1.5 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setDetailQuantity(q => Math.max(1, q - 1))}
                      className="text-[#4A3F35] bg-white border border-[#EBE9E1] rounded-lg p-1 transition-all"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-bold text-[#4A3F35] w-8 text-center text-sm">{detailQuantity}</span>
                    <button
                      type="button"
                      onClick={() => setDetailQuantity(q => q + 1)}
                      className="text-[#4A3F35] bg-white border border-[#EBE9E1] rounded-lg p-1 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-[#A69C91] font-semibold">
                    Subtotal: <strong className="text-[#D4A373] text-sm">{(selectedProduct.price * detailQuantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                  </div>
                </div>
              </div>

              {/* Custom notes input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-[#A69C91] uppercase tracking-wider">Observações do Produto</label>
                  <span className="text-[9px] text-[#A69C91] font-medium italic">Opcional</span>
                </div>
                <textarea
                  rows={2}
                  value={detailObservation}
                  onChange={(e) => setDetailObservation(e.target.value)}
                  placeholder="Ex: sem coco, vela simples, escrever 'Feliz Aniversário'..."
                  className="w-full px-3.5 py-2.5 text-xs bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl outline-none focus:border-[#D4A373] focus:bg-white transition resize-none"
                />
              </div>
            </div>

            {/* Popup actions footer */}
            <div className="p-6 bg-[#FAF9F6] border-t border-[#EBE9E1]/60 flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="px-5 py-3 text-xs font-bold text-[#A69C91] hover:text-[#4A3F35] transition-all"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleAddToCartDetailed}
                className="bg-[#4A3F35] hover:bg-[#5A4F44] text-white font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-xl transition-all shadow-xs"
              >
                Adicionar à Sacola - {(selectedProduct.price * detailQuantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
