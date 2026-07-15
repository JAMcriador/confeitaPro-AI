import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, collection, doc, getDocs, updateDoc, query } from '../firebase';
import { UserProfile, StoreConfig } from '../types';
import { ShieldCheck, Users, Cake, ShoppingCart, Ban, Unlock, Award, HelpCircle, Activity } from 'lucide-react';

export default function AdminView() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [stores, setStores] = useState<StoreConfig[]>([]);
  const [globalOrdersCount, setGlobalOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAdminData() {
      try {
        setLoading(true);

        // Load users
        const usersSnap = await getDocs(collection(db, 'users'));
        const uList: UserProfile[] = [];
        usersSnap.forEach((doc) => {
          uList.push({ ...doc.data() } as UserProfile);
        });
        setUsers(uList);

        // Load stores
        const storesSnap = await getDocs(collection(db, 'stores'));
        const sList: StoreConfig[] = [];
        storesSnap.forEach((doc) => {
          sList.push({ ...doc.data() } as StoreConfig);
        });
        setStores(sList);

        // Count all orders across all loaded stores
        let totalOrders = 0;
        for (const store of sList) {
          try {
            const ordSnap = await getDocs(collection(db, `stores/${store.id}/orders`));
            totalOrders += ordSnap.size;
          } catch (err) {
            // Ignore if subcollection read fails for any reason
          }
        }
        setGlobalOrdersCount(totalOrders);

      } catch (error) {
        console.error("Error loading admin data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadAdminData();
  }, []);

  const handleToggleBlock = async (user: UserProfile) => {
    const newStatus = user.status === 'active' ? 'blocked' : 'active';
    if (!window.confirm(`Tem certeza que deseja ${newStatus === 'blocked' ? 'BLOQUEAR' : 'DESBLOQUEAR'} o usuário ${user.name}?`)) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), { status: newStatus });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, status: newStatus as any } : u));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleTogglePlan = async (user: UserProfile) => {
    const newPlan = user.plan === 'free' ? 'pro' : 'free';
    try {
      await updateDoc(doc(db, 'users', user.uid), { plan: newPlan });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, plan: newPlan as any } : u));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  // Quick platform-wide summaries
  const activeUsers = users.filter(u => u.status === 'active').length;
  const proUsers = users.filter(u => u.plan === 'pro').length;

  return (
    <div className="space-y-6">
      {/* Admin Title Panel */}
      <div className="bg-gradient-to-r from-gray-900 to-indigo-950 rounded-3xl p-6 text-white shadow-sm flex items-center justify-between">
        <div className="space-y-1">
          <span className="bg-indigo-500 text-white text-[10px] font-bold tracking-widest px-2.5 py-1 rounded-md uppercase inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Painel Geral Administrativo
          </span>
          <h2 className="text-2xl font-bold tracking-tight">Métricas Gerais da ConfeitaPro</h2>
          <p className="text-gray-350 text-sm max-w-md">Controle de acessos, faturamento de assinaturas e status global de multiempresas.</p>
        </div>
        <div className="hidden sm:block p-3 bg-white/10 rounded-2xl">
          <Activity className="w-12 h-12 text-indigo-400 animate-pulse" />
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuários Cadastrados</span>
            <div className="p-2 bg-indigo-50 rounded-xl">
              <Users className="w-5 h-5 text-indigo-500" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{users.length}</div>
            <p className="text-xs text-gray-400 mt-1">{activeUsers} ativos • {users.length - activeUsers} bloqueados</p>
          </div>
        </div>

        {/* Total Stores */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Lojas Criadas</span>
            <div className="p-2 bg-pink-50 rounded-xl">
              <Cake className="w-5 h-5 text-pink-500" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{stores.length}</div>
            <p className="text-xs text-gray-400 mt-1">Confeiteiras integradas</p>
          </div>
        </div>

        {/* Total Orders */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total de Pedidos</span>
            <div className="p-2 bg-amber-50 rounded-xl">
              <ShoppingCart className="w-5 h-5 text-amber-500" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{globalOrdersCount}</div>
            <p className="text-xs text-gray-400 mt-1">Pedidos recebidos globalmente</p>
          </div>
        </div>

        {/* Premium Accounts */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assinaturas Pro</span>
            <div className="p-2 bg-emerald-50 rounded-xl">
              <Award className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-600">{proUsers}</div>
            <p className="text-xs text-gray-400 mt-1">{(proUsers / (users.length || 1) * 100).toFixed(0)}% conversão premium</p>
          </div>
        </div>
      </div>

      {/* Registered User Management Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-lg">Controle de Clientes SaaS</h3>
          <p className="text-xs text-gray-500 mt-0.5">Ative planos Pro, bloqueie inadimplentes e gerencie identidades.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-gray-100 text-gray-400 font-extrabold text-[10px] tracking-wider uppercase">
                <th className="py-4 px-6">Empreendedora</th>
                <th className="py-4 px-4">E-mail</th>
                <th className="py-4 px-4 text-center">Plano SaaS</th>
                <th className="py-4 px-4 text-center">Status</th>
                <th className="py-4 px-6 text-right">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {users.map((user) => {
                const userStore = stores.find(s => s.ownerId === user.uid);

                return (
                  <tr key={user.uid} className="hover:bg-zinc-50/30 transition">
                    <td className="py-4 px-6">
                      <div>
                        <p className="font-bold text-gray-800">{user.name}</p>
                        <p className="text-xs text-gray-400">
                          {userStore ? `Loja: ${userStore.name} (${userStore.slug})` : 'Sem loja ativa'}
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-600 font-medium">{user.email}</td>
                    
                    {/* SaaS Plan */}
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleTogglePlan(user)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition hover:scale-105 ${
                          user.plan === 'pro'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                        title="Clique para alterar plano"
                      >
                        <Award className="w-3.5 h-3.5" />
                        {user.plan === 'pro' ? 'PRO' : 'GRÁTIS'}
                      </button>
                    </td>

                    {/* Status badge */}
                    <td className="py-4 px-4 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        user.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.status === 'active' ? 'ATIVO' : 'BLOQUEADO'}
                      </span>
                    </td>

                    {/* Access Actions */}
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {user.status === 'active' ? (
                          <button
                            onClick={() => handleToggleBlock(user)}
                            className="bg-red-50 border border-red-100 hover:bg-red-100 text-red-700 text-xs font-bold px-3 py-1.5 rounded-xl transition inline-flex items-center gap-1"
                          >
                            <Ban className="w-3.5 h-3.5" /> Bloquear
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleBlock(user)}
                            className="bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-xl transition inline-flex items-center gap-1"
                          >
                            <Unlock className="w-3.5 h-3.5" /> Liberar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
