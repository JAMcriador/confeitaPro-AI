import { useState, useEffect } from 'react';
import { db, collection, query, getDocs, orderBy } from '../firebase';
import { Order, Product, InventoryItem } from '../types';
import { Calendar, Clock, ShoppingBag, User, Layers, Info, CheckCircle, AlertTriangle, Play, Sparkles } from 'lucide-react';

interface AgendaViewProps {
  storeId: string;
}

export default function AgendaView({ storeId }: AgendaViewProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected date state (defaults to today in local YYYY-MM-DD format)
  const getTodayLocalString = () => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalString());

  useEffect(() => {
    async function loadData() {
      if (!storeId) return;
      try {
        setLoading(true);
        
        // 1. Load active orders
        const ordersSnap = await getDocs(query(collection(db, `stores/${storeId}/orders`), orderBy('deliveryDateTime', 'asc')));
        const ordersList: Order[] = [];
        ordersSnap.forEach((doc) => {
          ordersList.push({ id: doc.id, ...doc.data() } as Order);
        });
        setOrders(ordersList.filter(o => o.status !== 'cancelled' && o.status !== 'delivered'));

        // 2. Load products (with recipes)
        const prodSnap = await getDocs(collection(db, `stores/${storeId}/products`));
        const prodList: Product[] = [];
        prodSnap.forEach((doc) => {
          prodList.push({ id: doc.id, ...doc.data() } as Product);
        });
        setProducts(prodList);

        // 3. Load current inventory
        const invSnap = await getDocs(collection(db, `stores/${storeId}/inventory`));
        const invList: InventoryItem[] = [];
        invSnap.forEach((doc) => {
          invList.push({ id: doc.id, ...doc.data() } as InventoryItem);
        });
        setInventory(invList);
      } catch (error) {
        console.error("Error loading production agenda data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [storeId]);

  // Filter orders by the selected date
  const dayOrders = orders.filter(o => o.deliveryDateTime.startsWith(selectedDate));

  // Consolidate confections (how many of each product must be made today)
  const confectionSummary: Record<string, { name: string; quantity: number }> = {};
  dayOrders.forEach(order => {
    order.items.forEach(item => {
      if (!confectionSummary[item.productId]) {
        confectionSummary[item.productId] = {
          name: item.name,
          quantity: 0
        };
      }
      confectionSummary[item.productId].quantity += item.quantity;
    });
  });

  // Consolidate ingredient requirements
  const requiredIngredients: Record<string, { name: string; quantity: number; unit: string; currentStock: number }> = {};

  Object.entries(confectionSummary).forEach(([prodId, summary]) => {
    const prod = products.find(p => p.id === prodId);
    if (prod && prod.recipe) {
      prod.recipe.forEach(recItem => {
        if (!requiredIngredients[recItem.ingredientId]) {
          const invItem = inventory.find(i => i.id === recItem.ingredientId);
          requiredIngredients[recItem.ingredientId] = {
            name: recItem.name,
            quantity: 0,
            unit: recItem.unit,
            currentStock: invItem ? invItem.quantity : 0
          };
        }
        requiredIngredients[recItem.ingredientId].quantity += recItem.quantity * summary.quantity;
      });
    }
  });

  const getQuickDateLabel = (dateStr: string) => {
    const today = getTodayLocalString();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    if (dateStr === today) return 'Hoje';
    if (dateStr === tomorrowStr) return 'Amanhã';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
  };

  const handleSetQuickDate = (daysOffset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    setSelectedDate(date.toISOString().split('T')[0]);
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
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[#FAF9F6]">
        <div>
          <h2 className="text-3xl font-serif italic text-[#4A3F35]">Agenda de Produção Diária</h2>
          <p className="text-sm text-[#A69C91]">Gerencie receitas consolidadas, demandas de confeitaria e insumos necessários para o dia.</p>
        </div>

        {/* Date Selectors & Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleSetQuickDate(0)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              selectedDate === getTodayLocalString()
                ? 'bg-[#4A3F35] text-white shadow-xs'
                : 'bg-white text-[#A69C91] border border-[#EBE9E1]'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => handleSetQuickDate(1)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
              selectedDate === new Date(Date.now() + 86400000).toISOString().split('T')[0]
                ? 'bg-[#4A3F35] text-white shadow-xs'
                : 'bg-white text-[#A69C91] border border-[#EBE9E1]'
            }`}
          >
            Amanhã
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-1.5 text-xs font-bold bg-white border border-[#EBE9E1] rounded-xl text-[#4A3F35] outline-none"
          />
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Col 1 & 2: Production Tasks list (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-[#E9EDC6] text-[#5A5A40] rounded-xl">
              <Calendar className="w-4 h-4" />
            </span>
            <h3 className="font-serif italic text-xl text-[#4A3F35]">Cronograma para {getQuickDateLabel(selectedDate)}</h3>
          </div>

          {dayOrders.length === 0 ? (
            <div className="bg-white rounded-[2rem] border border-[#EBE9E1] p-12 text-center text-[#A69C91] text-sm space-y-3">
              <p className="font-semibold">Nenhuma encomenda ativa agendada para esta data! ☕</p>
              <p className="text-xs">Seus pedidos confirmados e ativos aparecerão estruturados aqui para facilitar a confecção.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {dayOrders.map((order) => {
                const timeStr = new Date(order.deliveryDateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                
                return (
                  <div key={order.id} className="bg-white p-6 rounded-[2rem] border border-[#EBE9E1] shadow-xs hover:shadow-md transition duration-300 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-[#D4A373] font-bold uppercase">{order.orderNumber}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${
                          order.deliveryType === 'delivery' 
                            ? 'bg-amber-50 text-amber-700 border-amber-100' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        }`}>
                          {order.deliveryType === 'delivery' ? 'Entrega' : 'Retirada'}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-[#D4A373] flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {timeStr}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <p className="font-bold text-[#4A3F35] text-sm flex items-center gap-2">
                        <User className="w-4 h-4 text-[#A69C91]" /> {order.customerName}
                      </p>
                      
                      <div className="bg-[#FAF9F6] p-4 rounded-xl border border-[#EBE9E1]/40 space-y-2">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="text-xs flex justify-between text-[#4A3F35] font-medium">
                            <span>• {item.quantity}x {item.name}</span>
                            {item.notes && <span className="text-[10px] text-orange-600 italic">({item.notes})</span>}
                          </div>
                        ))}
                      </div>

                      {order.notes && (
                        <div className="flex gap-1.5 text-[10px] bg-blue-50/40 text-blue-800 p-2.5 rounded-xl border border-blue-100/40 italic">
                          <Info className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" />
                          <span>Obs do Pedido: "{order.notes}"</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Col 3: Consolidated Ingredients Summary (1/3 width) */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-[#FAF9F6] text-[#D4A373] rounded-xl border border-[#EBE9E1]/60">
              <Layers className="w-4 h-4" />
            </span>
            <h3 className="font-serif italic text-xl text-[#4A3F35]">Insumos do Dia</h3>
          </div>

          {dayOrders.length === 0 ? (
            <div className="bg-stone-50 border border-stone-200/50 p-6 rounded-[2rem] text-center text-xs text-stone-400">
              Selecione um dia com pedidos agendados para calcular automaticamente o total de ingredientes necessários para a produção.
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-[#EBE9E1] p-6 space-y-6 shadow-xs">
              {/* Quantities to produce first */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-[#A69C91] uppercase tracking-widest flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#D4A373]" /> Confeitos a Produzir ({Object.keys(confectionSummary).length})
                </h4>
                <div className="space-y-1.5">
                  {Object.values(confectionSummary).map((summary, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs text-[#4A3F35] font-semibold bg-[#FAF9F6] p-2.5 rounded-xl border border-[#EBE9E1]/30">
                      <span>{summary.name}</span>
                      <span className="bg-[#D4A373] text-white px-2.5 py-0.5 rounded-md text-[10px]">{summary.quantity} Unidade(s)</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ingredients Consolidated List */}
              <div className="space-y-3 pt-4 border-t border-gray-150">
                <h4 className="text-[10px] font-bold text-[#A69C91] uppercase tracking-widest">
                  🎛️ Consolidado de Receitas (Ficha Técnica)
                </h4>
                {Object.keys(requiredIngredients).length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic">Nenhum produto possui Ficha Técnica cadastrada para gerar lista de insumos.</p>
                ) : (
                  <div className="space-y-3">
                    {Object.values(requiredIngredients).map((ing, idx) => {
                      const isShortage = ing.currentStock < ing.quantity;

                      return (
                        <div key={idx} className="space-y-1 bg-white border border-gray-100 p-3 rounded-xl shadow-2xs">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-[#4A3F35]">{ing.name}</span>
                            <span className="text-stone-700 font-mono font-bold">{ing.quantity} {ing.unit}</span>
                          </div>
                          
                          <div className="flex justify-between items-center text-[10px] text-gray-400 pt-1 border-t border-gray-50 mt-1">
                            <span>No Estoque: {ing.currentStock} {ing.unit}</span>
                            {isShortage ? (
                              <span className="text-red-500 font-bold flex items-center gap-0.5">
                                <AlertTriangle className="w-3 h-3" /> Faltam {Number((ing.quantity - ing.currentStock).toFixed(2))} {ing.unit}
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-bold">✓ Disponível</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
