import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, collection, query, getDocs } from '../firebase';
import { Order, Product, InventoryItem } from '../types';
import { TrendingUp, ShoppingBag, Calendar, Package, AlertTriangle, ChevronRight, Cake } from 'lucide-react';

interface DashboardViewProps {
  storeId: string;
  onNavigate: (view: string) => void;
}

export default function DashboardView({ storeId, onNavigate }: DashboardViewProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [productsCount, setProductsCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // Fetch products count
        const prodPath = `stores/${storeId}/products`;
        let prodSize = 0;
        try {
          const prodSnap = await getDocs(collection(db, prodPath));
          prodSize = prodSnap.size;
          setProductsCount(prodSize);
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, prodPath);
        }

        // Fetch inventory low stock
        const invPath = `stores/${storeId}/inventory`;
        let lowCount = 0;
        try {
          const invSnap = await getDocs(collection(db, invPath));
          invSnap.forEach((doc) => {
            const data = doc.data() as InventoryItem;
            if (data.quantity <= data.minStock) {
              lowCount++;
            }
          });
          setLowStockCount(lowCount);
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, invPath);
        }

        // Fetch orders
        const ordPath = `stores/${storeId}/orders`;
        try {
          const ordSnap = await getDocs(collection(db, ordPath));
          const list: Order[] = [];
          ordSnap.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as Order);
          });
          setOrders(list);
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, ordPath);
        }

      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    if (storeId) {
      loadData();
    }
  }, [storeId]);

  // Calculations
  const todayStr = new Date().toISOString().split('T')[0];
  
  const todayOrders = orders.filter(o => {
    if (!o.deliveryDateTime) return false;
    return o.deliveryDateTime.startsWith(todayStr) && o.status !== 'cancelled';
  });

  const nextDeliveries = orders.filter(o => {
    if (!o.deliveryDateTime) return false;
    const orderDate = o.deliveryDateTime.split('T')[0];
    return orderDate >= todayStr && o.status !== 'delivered' && o.status !== 'cancelled';
  });

  // Calculate revenue for current week (last 7 days)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weeklyRevenue = orders
    .filter(o => {
      if (o.status === 'cancelled') return false;
      const orderDate = new Date(o.createdAt);
      return orderDate >= oneWeekAgo;
    })
    .reduce((sum, o) => sum + o.total, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-natural-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-[#4A3F35] rounded-[2rem] p-8 text-white shadow-xl shadow-stone-200/40 flex items-center justify-between">
        <div className="space-y-2">
          <h2 className="text-3xl font-serif italic text-white">Bem-vinda de volta!</h2>
          <p className="text-stone-300 text-sm max-w-md">Sua produção está organizada com tons naturais e elegantes. Veja abaixo o resumo do seu dia e as encomendas ativas.</p>
        </div>
        <div className="hidden sm:block p-4 bg-white/10 rounded-2xl">
          <Cake className="w-10 h-10 text-[#D4A373]" />
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Weekly Revenue */}
        <div className="bg-[#F5F2EB] p-6 rounded-[2rem] border border-[#EBE9E1] shadow-sm flex flex-col justify-between h-36">
          <span className="text-[11px] font-bold text-[#D4A373] uppercase tracking-widest">Vendas (7d)</span>
          <div className="flex items-end justify-between">
            <p className="text-2xl font-serif font-bold text-[#4A3F35]">
              {weeklyRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
        </div>

        {/* Today's Orders */}
        <div 
          className="bg-white p-6 rounded-[2rem] border border-[#EBE9E1] shadow-sm flex flex-col justify-between h-36 cursor-pointer hover:bg-[#F5F2EB]/40 transition-all" 
          onClick={() => onNavigate('agenda')}
        >
          <span className="text-[11px] font-bold text-[#A69C91] uppercase tracking-widest">Pedidos Hoje</span>
          <div className="flex items-end justify-between">
            <p className="text-4xl font-serif font-bold text-[#4A3F35]">{todayOrders.length}</p>
            {todayOrders.length > 0 && (
              <span className="text-[10px] bg-[#E9EDC6] px-2 py-1 rounded-lg text-[#5A5A40] font-bold">Ativo</span>
            )}
          </div>
        </div>

        {/* Upcoming Deliveries */}
        <div 
          className="bg-white p-6 rounded-[2rem] border border-[#EBE9E1] shadow-sm flex flex-col justify-between h-36 cursor-pointer hover:bg-[#F5F2EB]/40 transition-all" 
          onClick={() => onNavigate('orders')}
        >
          <span className="text-[11px] font-bold text-[#A69C91] uppercase tracking-widest">A Entregar</span>
          <div className="flex items-end justify-between">
            <p className="text-4xl font-serif font-bold text-[#4A3F35]">{nextDeliveries.length}</p>
          </div>
        </div>

        {/* Low Stock items */}
        <div 
          className={`p-6 rounded-[2rem] border shadow-sm flex flex-col justify-between h-36 cursor-pointer transition-all ${
            lowStockCount > 0 
              ? 'bg-[#FEF2F2] border-[#FEE2E2]' 
              : 'bg-white border-[#EBE9E1] hover:bg-[#F5F2EB]/40'
          }`} 
          onClick={() => onNavigate('inventory')}
        >
          <span className={`text-[11px] font-bold uppercase tracking-widest ${
            lowStockCount > 0 ? 'text-[#EF4444]' : 'text-[#A69C91]'
          }`}>
            Estoque Baixo
          </span>
          <div className="flex items-end justify-between">
            <p className={`text-4xl font-serif font-bold ${
              lowStockCount > 0 ? 'text-[#B91C1C]' : 'text-[#4A3F35]'
            }`}>{lowStockCount}</p>
          </div>
        </div>

        {/* Products Count */}
        <div 
          className="bg-white p-6 rounded-[2rem] border border-[#EBE9E1] shadow-sm flex flex-col justify-between h-36 cursor-pointer hover:bg-[#F5F2EB]/40 transition-all" 
          onClick={() => onNavigate('products')}
        >
          <span className="text-[11px] font-bold text-[#A69C91] uppercase tracking-widest">Cardápio</span>
          <div className="flex items-end justify-between">
            <p className="text-4xl font-serif font-bold text-[#4A3F35]">{productsCount}</p>
          </div>
        </div>
      </div>

      {/* Two Columns: Recent Pending Orders & Low Stock Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Orders Card */}
        <div className="bg-white rounded-[2rem] border border-[#EBE9E1] shadow-sm overflow-hidden flex flex-col">
          <div className="px-8 py-5 border-b border-[#FAF9F6] flex justify-between items-center bg-[#FAF9F6]/50">
            <h3 className="font-bold text-sm uppercase tracking-wider text-[#4A3F35]">Pedidos Pendentes</h3>
            <button onClick={() => onNavigate('orders')} className="text-xs font-semibold text-[#D4A373] hover:underline">
              Ver Todos →
            </button>
          </div>

          <div className="p-6 space-y-4">
            {orders.filter(o => o.status === 'pending').slice(0, 4).length === 0 ? (
              <div className="text-center py-12 text-[#A69C91] text-sm font-medium">
                Nenhum pedido pendente de aprovação! 🎉
              </div>
            ) : (
              orders.filter(o => o.status === 'pending').slice(0, 4).map((order) => (
                <div key={order.id} className="p-4 bg-[#F5F2EB]/50 rounded-2xl flex items-center justify-between border border-[#EBE9E1]/60 hover:bg-[#F5F2EB] transition-colors">
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-[#4A3F35]">{order.customerName}</p>
                    <p className="text-xs text-[#A69C91]">
                      Entrega: {new Date(order.deliveryDateTime).toLocaleDateString('pt-BR')} às {new Date(order.deliveryDateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right space-y-1.5">
                    <p className="font-bold text-sm text-[#4A3F35]">
                      {order.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    <span className="inline-block px-3 py-1 text-[10px] font-bold text-[#D4A373] bg-[#F5F2EB] rounded-full border border-[#EBE9E1]">
                      Pendente
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Agenda Overview Card */}
        <div className="bg-white rounded-[2rem] border border-[#EBE9E1] shadow-sm overflow-hidden flex flex-col">
          <div className="px-8 py-5 border-b border-[#FAF9F6] flex justify-between items-center bg-[#FAF9F6]/50">
            <h3 className="font-bold text-sm uppercase tracking-wider text-[#4A3F35]">Próximas Entregas (Hoje)</h3>
            <button onClick={() => onNavigate('agenda')} className="text-xs font-semibold text-[#D4A373] hover:underline">
              Ver Agenda →
            </button>
          </div>

          <div className="p-6 space-y-4">
            {todayOrders.slice(0, 4).length === 0 ? (
              <div className="text-center py-12 text-[#A69C91] text-sm font-medium">
                Sem entregas programadas para hoje!
              </div>
            ) : (
              todayOrders.slice(0, 4).map((order) => (
                <div key={order.id} className="p-4 bg-[#F5F2EB]/50 rounded-2xl flex items-center justify-between border border-[#EBE9E1]/60 hover:bg-[#F5F2EB] transition-colors">
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-[#4A3F35]">{order.customerName}</p>
                    <p className="text-xs text-[#A69C91] flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${order.deliveryType === 'delivery' ? 'bg-[#D4A373]' : 'bg-[#5A5A40]'}`}></span>
                      {order.deliveryType === 'delivery' ? 'Entrega em endereço' : 'Retirada no balcão'}
                    </p>
                  </div>
                  <div className="text-right space-y-1.5">
                    <p className="text-xs text-[#A69C91] font-semibold">
                      {new Date(order.deliveryDateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <span className={`inline-block px-3 py-1 text-[10px] font-bold rounded-full ${
                      order.status === 'processing' ? 'text-[#D4A373] bg-amber-50 border border-amber-100' :
                      order.status === 'ready' ? 'text-[#5A5A40] bg-[#E9EDC6] border border-[#EBE9E1]' : 'text-stone-500 bg-stone-100'
                    }`}>
                      {order.status === 'processing' ? 'Produzindo' :
                       order.status === 'ready' ? 'Pronto' : 'Pendente'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
