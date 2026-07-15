import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, collection, doc, updateDoc, onSnapshot, query, orderBy, getDocs, setDoc } from '../firebase';
import { Order, Product, InventoryItem, InventoryLog, Customer } from '../types';
import { MessageSquare, Calendar, Clock, ShoppingCart, Phone, CheckCircle, XCircle, AlertTriangle, AlertCircle, Sparkles } from 'lucide-react';

interface OrdersViewProps {
  storeId: string;
}

export default function OrdersView({ storeId }: OrdersViewProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 8 Status filters
  const [selectedStatus, setSelectedStatus] = useState<
    'all' | 'pending' | 'received' | 'confirmed' | 'preparing' | 'decorating' | 'ready' | 'dispatched' | 'delivered' | 'cancelled'
  >('all');

  // Shortage modal states
  const [shortageItems, setShortageItems] = useState<{ name: string; missingQty: number; unit: string }[]>([]);
  const [showShortageModal, setShowShortageModal] = useState(false);

  // Load orders in real-time
  useEffect(() => {
    let unsubscribe = () => {};
    if (storeId) {
      setLoading(true);
      const path = `stores/${storeId}/orders`;
      const q = query(collection(db, path), orderBy('createdAt', 'desc'));
      
      unsubscribe = onSnapshot(q, (snapshot) => {
        const list: Order[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Order);
        });
        setOrders(list);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, path);
        setLoading(false);
      });
    }
    return () => unsubscribe();
  }, [storeId]);

  // Load auxiliary data (products and inventory) for stock checking
  const loadAuxiliaryData = async () => {
    if (!storeId) return;
    try {
      const prodSnap = await getDocs(collection(db, `stores/${storeId}/products`));
      const prodList: Product[] = [];
      prodSnap.forEach(d => {
        prodList.push({ id: d.id, ...d.data() } as Product);
      });
      setProducts(prodList);

      const invSnap = await getDocs(collection(db, `stores/${storeId}/inventory`));
      const invList: InventoryItem[] = [];
      invSnap.forEach(d => {
        invList.push({ id: d.id, ...d.data() } as InventoryItem);
      });
      setInventory(invList);
    } catch (err) {
      console.error("Erro ao carregar dados auxiliares de estoque:", err);
    }
  };

  useEffect(() => {
    loadAuxiliaryData();
  }, [storeId]);

  // Handle status transitions
  const updateOrderStatus = async (order: Order, newStatus: Order['status']) => {
    const path = `stores/${storeId}/orders`;

    // 1. If transitioning to CONFIRMED, perform stock verification & deduction, and client registration
    if (newStatus === 'confirmed') {
      await loadAuxiliaryData(); // Refresh stock details

      // Calculate total required ingredients for this order
      const requiredIngredients: Record<string, { name: string; quantity: number; unit: string }> = {};

      for (const item of order.items) {
        const prod = products.find(p => p.id === item.productId);
        if (prod && prod.recipe) {
          for (const recItem of prod.recipe) {
            if (!requiredIngredients[recItem.ingredientId]) {
              requiredIngredients[recItem.ingredientId] = {
                name: recItem.name,
                quantity: 0,
                unit: recItem.unit
              };
            }
            requiredIngredients[recItem.ingredientId].quantity += recItem.quantity * item.quantity;
          }
        }
      }

      // Check for shortages against current inventory
      const shortages: { name: string; missingQty: number; unit: string }[] = [];

      for (const [ingId, req] of Object.entries(requiredIngredients)) {
        const invItem = inventory.find(i => i.id === ingId);
        const currentQty = invItem ? invItem.quantity : 0;
        if (currentQty < req.quantity) {
          shortages.push({
            name: req.name,
            missingQty: Number((req.quantity - currentQty).toFixed(2)),
            unit: req.unit
          });
        }
      }

      // If shortages exist, block transition and trigger visual warning
      if (shortages.length > 0) {
        setShortageItems(shortages);
        setShowShortageModal(true);
        return;
      }

      // Perform automatic stock deduction
      try {
        for (const [ingId, req] of Object.entries(requiredIngredients)) {
          const invItem = inventory.find(i => i.id === ingId);
          if (invItem) {
            const newQty = Math.max(0, Number((invItem.quantity - req.quantity).toFixed(2)));
            await updateDoc(doc(db, `stores/${storeId}/inventory`, ingId), { quantity: newQty });

            // Create inventory log
            const logRef = doc(collection(db, `stores/${storeId}/inventory_logs`));
            const logPayload: InventoryLog = {
              id: logRef.id,
              storeId,
              ownerId: invItem.ownerId,
              ingredientId: ingId,
              ingredientName: invItem.name,
              quantityChange: -req.quantity,
              type: 'deduction',
              referenceId: order.id,
              referenceName: `Pedido ${order.orderNumber}`,
              createdAt: new Date().toISOString()
            };
            await setDoc(logRef, logPayload);
          }
        }
      } catch (e) {
        console.error("Erro na baixa de estoque:", e);
        alert("Falha ao deduzir ingredientes do estoque. Entre em contato com o suporte.");
        return;
      }

      // Automatic customer registration / update history
      try {
        const phoneClean = order.customerPhone.trim();
        const nameClean = order.customerName.trim();
        const custQuery = query(collection(db, `stores/${storeId}/customers`));
        const custSnap = await getDocs(custQuery);
        let existingCustomer: Customer | null = null;
        
        custSnap.forEach(d => {
          const c = d.data() as Customer;
          if (c.phone === phoneClean) {
            existingCustomer = { id: d.id, ...c };
          }
        });

        const nowStr = new Date().toISOString();
        if (existingCustomer) {
          await updateDoc(doc(db, `stores/${storeId}/customers`, (existingCustomer as Customer).id), {
            ordersCount: (existingCustomer as Customer).ordersCount + 1,
            totalSpent: (existingCustomer as Customer).totalSpent + order.total,
            lastPurchaseDate: nowStr
          });
        } else {
          const custRef = doc(collection(db, `stores/${storeId}/customers`));
          const newCustomer: Customer = {
            id: custRef.id,
            storeId,
            ownerId: order.ownerId,
            name: nameClean,
            phone: phoneClean,
            ordersCount: 1,
            totalSpent: order.total,
            lastPurchaseDate: nowStr,
            createdAt: nowStr
          };
          await setDoc(custRef, newCustomer);
        }
      } catch (e) {
        console.error("Erro ao registrar histórico do cliente:", e);
      }
    }

    // 2. Perform the actual order status update
    try {
      await updateDoc(doc(db, path, order.id), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      loadAuxiliaryData(); // refresh UI local copy of stock
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${path}/${order.id}`);
    }
  };

  const handleWhatsAppChat = (order: Order) => {
    const cleanPhone = order.customerPhone.replace(/\D/g, '');
    const itemsText = order.items
      .map(item => `• ${item.quantity}x ${item.name} (${item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`)
      .join('\n');

    const dateFormatted = new Date(order.deliveryDateTime).toLocaleDateString('pt-BR');
    const timeFormatted = new Date(order.deliveryDateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let statusPt = 'Pendente';
    if (order.status === 'received') statusPt = 'Recebido 📥';
    if (order.status === 'confirmed') statusPt = 'Confirmado e em Preparação 👩‍🍳';
    if (order.status === 'preparing') statusPt = 'Sendo Produzido 🧁';
    if (order.status === 'decorating') statusPt = 'Fase de Decoração final ✨';
    if (order.status === 'ready') statusPt = 'Prontinho para você! 🎂';
    if (order.status === 'dispatched') statusPt = 'A caminho da entrega! 🚚';
    if (order.status === 'delivered') statusPt = 'Entregue / Finalizado! ✅';
    if (order.status === 'cancelled') statusPt = 'Cancelado ❌';

    const text = encodeURIComponent(
      `Olá, *${order.customerName}*! Tudo bem?\n` +
      `Aqui é do ConfeitaPro AI. Passando para conversar sobre o seu pedido *${order.orderNumber}*:\n\n` +
      `*Itens:* \n${itemsText}\n\n` +
      `*Total:* ${order.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n` +
      `*Agendado para:* ${dateFormatted} às ${timeFormatted}\n` +
      `*Forma:* ${order.deliveryType === 'delivery' ? 'Entrega em endereço' : 'Retirada no balcão'}\n` +
      `*Status do Pedido:* ${statusPt}\n\n` +
      `Podemos combinar os detalhes por aqui!`
    );

    window.open(`https://wa.me/55${cleanPhone}?text=${text}`, '_blank');
  };

  const filteredOrders = orders.filter(o => {
    if (selectedStatus === 'all') return true;
    return o.status === selectedStatus;
  });

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return <span className="px-3 py-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-full uppercase tracking-wider">Novo</span>;
      case 'received':
        return <span className="px-3 py-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full uppercase tracking-wider">Recebido</span>;
      case 'confirmed':
        return <span className="px-3 py-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-full uppercase tracking-wider">Confirmado</span>;
      case 'preparing':
        return <span className="px-3 py-1 text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 rounded-full uppercase tracking-wider">Produção</span>;
      case 'decorating':
        return <span className="px-3 py-1 text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-100 rounded-full uppercase tracking-wider">Decoração</span>;
      case 'ready':
        return <span className="px-3 py-1 text-[10px] font-bold text-green-600 bg-green-50 border border-green-100 rounded-full uppercase tracking-wider">Pronto</span>;
      case 'dispatched':
        return <span className="px-3 py-1 text-[10px] font-bold text-cyan-600 bg-cyan-50 border border-cyan-100 rounded-full uppercase tracking-wider">A Caminho</span>;
      case 'delivered':
        return <span className="px-3 py-1 text-[10px] font-bold text-stone-500 bg-stone-100 border border-stone-200 rounded-full uppercase tracking-wider">Entregue</span>;
      case 'cancelled':
        return <span className="px-3 py-1 text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 rounded-full uppercase tracking-wider">Cancelado</span>;
    }
  };

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
      <div>
        <h2 className="text-3xl font-serif italic text-[#4A3F35]">Gerenciar Encomendas</h2>
        <p className="text-sm text-[#A69C91]">Acompanhe as solicitações, execute baixas inteligentes automáticas e mude status do fluxo de produção.</p>
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
        {(['all', 'pending', 'received', 'confirmed', 'preparing', 'decorating', 'ready', 'dispatched', 'delivered', 'cancelled'] as const).map((status) => {
          const count = status === 'all' ? orders.length : orders.filter(o => o.status === status).length;
          const statusLabels: Record<string, string> = {
            all: 'Todos',
            pending: 'Novos',
            received: 'Recebidos',
            confirmed: 'Confirmados',
            preparing: 'Em Produção',
            decorating: 'Decoração',
            ready: 'Prontos',
            dispatched: 'Na Rota',
            delivered: 'Concluídos',
            cancelled: 'Cancelados'
          };

          const isActive = selectedStatus === status;

          return (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`whitespace-nowrap px-4 py-2 rounded-2xl text-xs font-bold transition-all border flex items-center gap-2 ${
                isActive
                  ? 'bg-[#F5F2EB] text-[#4A3F35] border-[#EBE9E1] shadow-xs'
                  : 'bg-white text-[#A69C91] border-transparent hover:text-[#4A3F35] hover:bg-[#F5F2EB]/30'
              }`}
            >
              <span>{statusLabels[status]}</span>
              <span className={`px-2 py-0.5 text-[9px] font-bold rounded-lg ${
                isActive 
                  ? 'bg-[#D4A373] text-white' 
                  : 'bg-[#FAF9F6] text-[#A69C91] border border-[#EBE9E1]/60'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-[2rem] border border-[#EBE9E1] p-12 text-center max-w-lg mx-auto space-y-6 shadow-sm">
          <div className="p-4 bg-[#F5F2EB] rounded-full w-16 h-16 flex items-center justify-center mx-auto text-[#D4A373]">
            <ShoppingCart className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-[#4A3F35] text-lg">Sem pedidos nesta categoria</h3>
            <p className="text-sm text-[#A69C91]">Quando seus clientes fizerem pedidos na sua página pública, eles aparecerão em tempo real aqui!</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {filteredOrders.map((order) => {
            const dateObj = new Date(order.deliveryDateTime);
            const dateStr = dateObj.toLocaleDateString('pt-BR');
            const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={order.id}
                className="bg-white rounded-[2rem] border border-[#EBE9E1] shadow-sm p-8 space-y-6 flex flex-col justify-between hover:shadow-md transition-all duration-300"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between pb-4 border-b border-[#FAF9F6]">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-[#D4A373] font-bold uppercase tracking-wider">{order.orderNumber}</span>
                    <h4 className="font-bold text-[#4A3F35] text-lg leading-tight">{order.customerName}</h4>
                  </div>
                  <div>{getStatusBadge(order.status)}</div>
                </div>

                {/* Logistics */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="flex items-center text-[#4A3F35] gap-2.5">
                    <Calendar className="w-4 h-4 text-[#D4A373] flex-shrink-0" />
                    <div>
                      <p className="font-bold text-[#A69C91] text-[9px] uppercase tracking-wider">DATA DE ENTREGA</p>
                      <p className="font-semibold text-[#4A3F35] mt-0.5">{dateStr}</p>
                    </div>
                  </div>
                  <div className="flex items-center text-[#4A3F35] gap-2.5">
                    <Clock className="w-4 h-4 text-[#D4A373] flex-shrink-0" />
                    <div>
                      <p className="font-bold text-[#A69C91] text-[9px] uppercase tracking-wider">HORÁRIO</p>
                      <p className="font-semibold text-[#4A3F35] mt-0.5">{timeStr}</p>
                    </div>
                  </div>
                  <div className="flex items-center text-[#4A3F35] gap-2.5 col-span-2">
                    <Phone className="w-4 h-4 text-[#D4A373] flex-shrink-0" />
                    <div>
                      <p className="font-bold text-[#A69C91] text-[9px] uppercase tracking-wider">CONTATO</p>
                      <p className="font-semibold text-[#4A3F35] mt-0.5">{order.customerPhone}</p>
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <div className="bg-[#FAF9F6] rounded-2xl p-5 text-xs space-y-3 border border-[#EBE9E1]/40">
                  <p className="font-bold text-[#A69C91] text-[9px] tracking-widest uppercase">ITENS DO PEDIDO</p>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-[#4A3F35]">
                        <span className="font-medium">{item.quantity}x {item.name}</span>
                        <span className="font-bold text-[#A69C91]">
                          {(item.price * item.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    ))}
                  </div>
                  {order.notes && (
                    <div className="pt-3 border-t border-[#EBE9E1]/60 mt-2">
                      <p className="font-bold text-[#A69C91] text-[9px] uppercase tracking-widest">OBSERVAÇÕES:</p>
                      <p className="text-stone-500 italic mt-1 leading-relaxed">{order.notes}</p>
                    </div>
                  )}
                  <div className="pt-4 border-t border-[#EBE9E1]/60 flex justify-between font-bold text-[#4A3F35] text-sm">
                    <span>Total do Pedido</span>
                    <span className="text-[#D4A373] font-serif font-bold text-base">
                      {order.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                </div>

                {/* Status transitions workflow */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateOrderStatus(order, 'received')}
                      className="flex-1 bg-[#4A3F35] hover:bg-[#5A4F44] text-white text-xs font-bold py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4" /> Marcar Recebido
                    </button>
                  )}

                  {order.status === 'received' && (
                    <button
                      onClick={() => updateOrderStatus(order, 'confirmed')}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                      title="Isso fará a baixa inteligente de ingredientes do estoque."
                    >
                      <Sparkles className="w-4 h-4" /> Confirmar & Baixar Estoque
                    </button>
                  )}

                  {order.status === 'confirmed' && (
                    <button
                      onClick={() => updateOrderStatus(order, 'preparing')}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4" /> Iniciar Produção
                    </button>
                  )}

                  {order.status === 'preparing' && (
                    <button
                      onClick={() => updateOrderStatus(order, 'decorating')}
                      className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4" /> Ir para Decoração
                    </button>
                  )}

                  {order.status === 'decorating' && (
                    <button
                      onClick={() => updateOrderStatus(order, 'ready')}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4" /> Marcar Pronto
                    </button>
                  )}

                  {order.status === 'ready' && (
                    <button
                      onClick={() => updateOrderStatus(order, order.deliveryType === 'delivery' ? 'dispatched' : 'delivered')}
                      className="flex-1 bg-[#5A5A40] hover:bg-[#4D4D37] text-white text-xs font-bold py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4" /> {order.deliveryType === 'delivery' ? 'Saiu para Entrega' : 'Finalizar Retirada'}
                    </button>
                  )}

                  {order.status === 'dispatched' && (
                    <button
                      onClick={() => updateOrderStatus(order, 'delivered')}
                      className="flex-1 bg-stone-700 hover:bg-stone-800 text-white text-xs font-bold py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4" /> Concluir Pedido
                    </button>
                  )}

                  {/* Cancel support */}
                  {order.status !== 'delivered' && order.status !== 'cancelled' && (
                    <button
                      onClick={() => updateOrderStatus(order, 'cancelled')}
                      className="p-3 text-[#A69C91] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="Cancelar Pedido"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  )}

                  {/* WhatsApp contact support */}
                  <button
                    onClick={() => handleWhatsAppChat(order)}
                    className="bg-[#E9EDC6]/40 hover:bg-[#E9EDC6]/70 text-[#5A5A40] text-xs font-bold py-3 px-4 rounded-xl transition-all border border-[#EBE9E1]/30 flex items-center justify-center gap-1.5"
                  >
                    <MessageSquare className="w-4 h-4 text-[#5A5A40]" /> WhatsApp
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SHORTAGE ERROR MODAL (ALERTA DE ESTOQUE INSUFICIENTE) */}
      {showShortageModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-[2rem] border border-[#EBE9E1] w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-[#FAF9F6] flex items-center gap-3 bg-[#FAF9F6]/50">
              <div className="p-2 bg-amber-50 rounded-full text-amber-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#4A3F35]">Ingredientes Insuficientes!</h3>
                <p className="text-[10px] text-gray-400">Não há estoque de segurança suficiente para confirmar o pedido.</p>
              </div>
            </div>

            {/* Content List */}
            <div className="p-8 space-y-4">
              <div className="flex gap-2.5 bg-red-50/50 p-4 rounded-2xl border border-red-100/60 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
                <p className="leading-relaxed">
                  A baixa inteligente automática foi suspensa temporariamente para evitar estoque negativo. Adicione as seguintes quantidades adicionais no controle de estoque:
                </p>
              </div>

              <div className="space-y-2">
                {shortageItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-[#FAF9F6] p-3 rounded-xl border border-[#EBE9E1]/40 text-xs text-[#4A3F35]">
                    <span className="font-semibold">{item.name}</span>
                    <span className="font-bold text-red-600">Falta: {item.missingQty} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowShortageModal(false)}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#4A3F35] text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-[#5A4F44] transition-all"
              >
                Entendido, vou ajustar o estoque
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
