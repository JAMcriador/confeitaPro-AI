import { useState, useEffect, FormEvent } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from 'firebase/auth';
import { auth, db, doc, getDoc, setDoc, isSandboxActive, setSandboxActive } from './firebase';
import { UserProfile, StoreConfig } from './types';

// Curated UI Views
import DashboardView from './components/DashboardView';
import ProductsView from './components/ProductsView';
import OrdersView from './components/OrdersView';
import AgendaView from './components/AgendaView';
import InventoryView from './components/InventoryView';
import StoreSettingsView from './components/StoreSettingsView';
import AdminView from './components/AdminView';
import PublicStoreView from './components/PublicStoreView';

// Curated Assets
import { PRESET_AVATARS, PRESET_COVERS, PRESET_PRODUCTS } from './utils/assets';

// Icons
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Package, 
  Calendar, 
  ClipboardList, 
  Store, 
  ShieldCheck, 
  LogOut, 
  Mail, 
  Lock, 
  User, 
  Cake, 
  Globe, 
  Sparkles,
  ArrowRight,
  Menu,
  X
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [store, setStore] = useState<StoreConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth Inputs
  const [isSignUp, setIsSignUp] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');

  // Store Onboarding wizard Inputs
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreSlug, setNewStoreSlug] = useState('');
  const [wizardError, setWizardError] = useState('');

  // Routing detection: Check if we are on a public store page, e.g. /store/{slug}, #/store/{slug}, or ?store={slug}
  const [publicSlug, setPublicSlug] = useState<string | null>(null);

  useEffect(() => {
    const detectSlug = () => {
      // 1. Check path (e.g., /store/delicias-da-maria)
      const path = window.location.pathname;
      if (path.startsWith('/store/')) {
        const slug = path.split('/store/')[1];
        if (slug && slug.trim() !== '') {
          let clean = slug.split('/')[0].split('?')[0].trim();
          if (clean.endsWith('/')) {
            clean = clean.slice(0, -1);
          }
          console.log(`[Router] Detected slug from path: "${clean}"`);
          return clean;
        }
      }

      // 2. Check hash (e.g., #/store/delicias-da-maria)
      const hash = window.location.hash;
      if (hash.startsWith('#/store/')) {
        const slug = hash.split('#/store/')[1];
        if (slug && slug.trim() !== '') {
          let clean = slug.split('?')[0].trim();
          if (clean.endsWith('/')) {
            clean = clean.slice(0, -1);
          }
          console.log(`[Router] Detected slug from hash: "${clean}"`);
          return clean;
        }
      }

      // 3. Check query parameters (e.g., ?store=delicias-da-maria)
      const params = new URLSearchParams(window.location.search);
      const storeParam = params.get('store') || params.get('s');
      if (storeParam && storeParam.trim() !== '') {
        let clean = storeParam.trim();
        if (clean.endsWith('/')) {
          clean = clean.slice(0, -1);
        }
        console.log(`[Router] Detected slug from query parameter: "${clean}"`);
        return clean;
      }

      return null;
    };

    const slug = detectSlug();
    if (slug) {
      console.log(`[Router] Initializing public store view for slug: "${slug}"`);
      setPublicSlug(slug);
    }

    // Set up popstate and hashchange listeners for smooth SPA navigation
    const handleNavigationChange = () => {
      const slug = detectSlug();
      console.log(`[Router] Navigation event, detected slug: "${slug}"`);
      setPublicSlug(slug);
    };

    window.addEventListener('hashchange', handleNavigationChange);
    window.addEventListener('popstate', handleNavigationChange);
    
    return () => {
      window.removeEventListener('hashchange', handleNavigationChange);
      window.removeEventListener('popstate', handleNavigationChange);
    };
  }, []);

  // Listen to Auth State
  useEffect(() => {
    if (publicSlug) {
      setLoading(false);
      return; // Do not check auth for public store clients
    }

    if (isSandboxActive()) {
      const demoUid = 'mock-demo-user-123';
      const demoSlug = 'delicias-da-maria';
      
      const demoProfile: UserProfile = {
        uid: demoUid,
        email: 'demonstracao@confeitapro.com',
        name: 'Maria Brigadeiros (Modo Local)',
        storeId: demoSlug,
        role: 'owner',
        status: 'active',
        plan: 'pro',
        createdAt: new Date().toISOString()
      };

      const demoStore: StoreConfig = {
        id: demoSlug,
        ownerId: demoUid,
        slug: demoSlug,
        name: 'Delícias da Maria',
        description: 'Bolos caseiros gourmet, tortas recheadas e brigadeiros artesanais feitos com carinho (Rodando Localmente).',
        address: 'Rua das Confeitarias, 456, Jardim Doce, São Paulo',
        workingHours: 'Terça a Sábado: 10h às 19h',
        whatsapp: '11999999999',
        instagram: '@deliciasdamaria',
        logoUrl: PRESET_AVATARS[0].url,
        coverUrl: PRESET_COVERS[0].url,
        createdAt: new Date().toISOString()
      };

      setCurrentUser(demoProfile);
      setStore(demoStore);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Fetch custom user profile
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          
          if (userDoc.exists()) {
            const profile = userDoc.data() as UserProfile;
            setCurrentUser(profile);

            // Fetch their store configuration if they have one
            if (profile.storeId) {
              const storeDoc = await getDoc(doc(db, 'stores', profile.storeId));
              if (storeDoc.exists()) {
                setStore(storeDoc.data() as StoreConfig);
              }
            }
          } else {
            // New user registered or social sign-in without profile yet
            const isPlatformAdmin = firebaseUser.email?.toLowerCase() === "josuealvaro.damata@gmail.com";
            
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || authName || 'Confeiteira',
              role: isPlatformAdmin ? 'admin' : 'owner',
              status: 'active',
              plan: 'free',
              createdAt: new Date().toISOString()
            };

            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setCurrentUser(newProfile);
          }
        } else {
          setCurrentUser(null);
          setStore(null);
        }
      } catch (err) {
        console.error("Error setting up auth state:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [publicSlug]);

  // Auth Operations
  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!authEmail || !authPassword) return;

    try {
      setLoading(true);
      if (isSignUp) {
        if (!authName) {
          setAuthError('Por favor informe o seu nome.');
          setLoading(false);
          return;
        }
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('Este e-mail já está em uso.');
      } else if (err.code === 'auth/invalid-credential') {
        setAuthError('E-mail ou senha incorretos.');
      } else if (err.code === 'auth/weak-password') {
        setAuthError('A senha deve possuir pelo menos 6 caracteres.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setAuthError('auth/operation-not-allowed: O provedor de login com E-mail/Senha não está ativado no seu Firebase Console.');
      } else {
        setAuthError(`Erro no acesso: ${err.message || 'Verifique suas credenciais.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError('');
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setAuthError('auth/operation-not-allowed: O provedor de login do Google não está ativado no seu Firebase Console.');
      } else {
        setAuthError('Erro ao autenticar com o Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setSandboxActive(false);
      await signOut(auth);
      setCurrentUser(null);
      setStore(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Setup Demo Mode instantly for evaluation
  const handleLaunchDemoMode = async () => {
    try {
      setLoading(true);
      // We sign-in as a specialized public test account (or simulate auth credentials)
      // to let users test right away in their browser frame
      const demoEmail = 'demonstracao@confeitapro.com';
      const demoPass = 'demo123456';
      
      try {
        await signInWithEmailAndPassword(auth, demoEmail, demoPass);
      } catch (err: any) {
        // If demo profile is not created in authentication, create it on the fly!
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
          await createUserWithEmailAndPassword(auth, demoEmail, demoPass);
          // Auto creation sets profile up. Now we seed some default data!
          const demoUid = auth.currentUser?.uid;
          if (demoUid) {
            const demoSlug = 'delicias-da-maria';
            const demoProfile: UserProfile = {
              uid: demoUid,
              email: demoEmail,
              name: 'Maria Brigadeiros',
              storeId: demoSlug,
              role: 'owner',
              status: 'active',
              plan: 'pro', // Give pro status in demo mode!
              createdAt: new Date().toISOString()
            };

            const demoStore: StoreConfig = {
              id: demoSlug,
              ownerId: demoUid,
              slug: demoSlug,
              name: 'Delícias da Maria',
              description: 'Bolos caseiros gourmet, tortas recheadas e brigadeiros artesanais feitos com carinho.',
              address: 'Rua das Confeitarias, 456, Jardim Doce, São Paulo',
              workingHours: 'Terça a Sábado: 10h às 19h',
              whatsapp: '11999999999',
              instagram: '@deliciasdamaria',
              logoUrl: PRESET_AVATARS[0].url,
              coverUrl: PRESET_COVERS[0].url,
              createdAt: new Date().toISOString()
            };

            await setDoc(doc(db, 'users', demoUid), demoProfile);
            await setDoc(doc(db, 'stores', demoSlug), demoStore);

            // Seed 3 delicious products
            await setDoc(doc(db, `stores/${demoSlug}/products`, 'p1'), {
              id: 'p1', storeId: demoSlug, ownerId: demoUid, name: 'Bolo Prestígio Supremo', 
              category: 'Bolos', description: 'Bolo de chocolate macio recheado com coco cremoso e cobertura de ganache belga.',
              price: 85, productionTime: 120, imageUrl: PRESET_PRODUCTS[0].url, active: true, createdAt: new Date().toISOString()
            });
            await setDoc(doc(db, `stores/${demoSlug}/products`, 'p2'), {
              id: 'p2', storeId: demoSlug, ownerId: demoUid, name: 'Kit 25 Brigadeiros Sortidos', 
              category: 'Docinhos', description: 'Caixa cartonada premium contendo brigadeiro tradicional, ninho com nutella, pistache e churros.',
              price: 45, productionTime: 60, imageUrl: PRESET_PRODUCTS[3].url, active: true, createdAt: new Date().toISOString()
            });
            await setDoc(doc(db, `stores/${demoSlug}/products`, 'p3'), {
              id: 'p3', storeId: demoSlug, ownerId: demoUid, name: 'Torta Gelada de Limão', 
              category: 'Tortas', description: 'Massa sablée crocante, creme azedinho de limão siciliano e merengue suíço maçaricado.',
              price: 65, productionTime: 90, imageUrl: PRESET_PRODUCTS[4].url, active: true, createdAt: new Date().toISOString()
            });

            // Seed inventory
            await setDoc(doc(db, `stores/${demoSlug}/inventory`, 'i1'), {
              id: 'i1', storeId: demoSlug, ownerId: demoUid, name: 'Chocolate em Pó Solúvel 50%',
              quantity: 800, unit: 'g', minStock: 1000, createdAt: new Date().toISOString() // Trigger stock warning!
            });
            await setDoc(doc(db, `stores/${demoSlug}/inventory`, 'i2'), {
              id: 'i2', storeId: demoSlug, ownerId: demoUid, name: 'Leite Condensado Itambé',
              quantity: 12, unit: 'un', minStock: 6, createdAt: new Date().toISOString()
            });

            // Seed 1 test order
            await setDoc(doc(db, `stores/${demoSlug}/orders`, 'o1'), {
              id: 'o1', storeId: demoSlug, ownerId: demoUid, orderNumber: '#C4391',
              customerName: 'Rosângela Souza', customerPhone: '11988888888', deliveryType: 'pickup',
              deliveryDateTime: new Date(Date.now() + 86400000).toISOString(), notes: 'Por favor, embalar para presente com fita rosa.',
              items: [{ productId: 'p1', name: 'Bolo Prestígio Supremo', price: 85, quantity: 1 }],
              total: 85, status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            });
          }
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      console.warn("Authentication unavailable, launching in Local Sandbox Mode:", err);
      // Fallback to local sandbox mode immediately!
      setSandboxActive(true);
      
      const demoUid = 'mock-demo-user-123';
      const demoSlug = 'delicias-da-maria';
      
      const demoProfile: UserProfile = {
        uid: demoUid,
        email: 'demonstracao@confeitapro.com',
        name: 'Maria Brigadeiros (Modo Local)',
        storeId: demoSlug,
        role: 'owner',
        status: 'active',
        plan: 'pro',
        createdAt: new Date().toISOString()
      };

      const demoStore: StoreConfig = {
        id: demoSlug,
        ownerId: demoUid,
        slug: demoSlug,
        name: 'Delícias da Maria',
        description: 'Bolos caseiros gourmet, tortas recheadas e brigadeiros artesanais feitos com carinho (Rodando Localmente).',
        address: 'Rua das Confeitarias, 456, Jardim Doce, São Paulo',
        workingHours: 'Terça a Sábado: 10h às 19h',
        whatsapp: '11999999999',
        instagram: '@deliciasdamaria',
        logoUrl: PRESET_AVATARS[0].url,
        coverUrl: PRESET_COVERS[0].url,
        createdAt: new Date().toISOString()
      };

      // Seed mock database
      await setDoc(doc(db, 'users', demoUid), demoProfile);
      await setDoc(doc(db, 'stores', demoSlug), demoStore);

      // Seed 3 delicious products
      await setDoc(doc(db, `stores/${demoSlug}/products`, 'p1'), {
        id: 'p1', storeId: demoSlug, ownerId: demoUid, name: 'Bolo Prestígio Supremo', 
        category: 'Bolos', description: 'Bolo de chocolate macio recheado com coco cremoso e cobertura de ganache belga.',
        price: 85, productionTime: 120, imageUrl: PRESET_PRODUCTS[0].url, active: true, createdAt: new Date().toISOString()
      });
      await setDoc(doc(db, `stores/${demoSlug}/products`, 'p2'), {
        id: 'p2', storeId: demoSlug, ownerId: demoUid, name: 'Kit 25 Brigadeiros Sortidos', 
        category: 'Docinhos', description: 'Caixa cartonada premium contendo brigadeiro tradicional, ninho com nutella, pistache e churros.',
        price: 45, productionTime: 60, imageUrl: PRESET_PRODUCTS[3].url, active: true, createdAt: new Date().toISOString()
      });
      await setDoc(doc(db, `stores/${demoSlug}/products`, 'p3'), {
        id: 'p3', storeId: demoSlug, ownerId: demoUid, name: 'Torta Gelada de Limão', 
        category: 'Tortas', description: 'Massa sablée crocante, creme azedinho de limão siciliano e merengue suíço maçaricado.',
        price: 65, productionTime: 90, imageUrl: PRESET_PRODUCTS[4].url, active: true, createdAt: new Date().toISOString()
      });

      // Seed inventory
      await setDoc(doc(db, `stores/${demoSlug}/inventory`, 'i1'), {
        id: 'i1', storeId: demoSlug, ownerId: demoUid, name: 'Chocolate em Pó Solúvel 50%',
        quantity: 800, unit: 'g', minStock: 1000, createdAt: new Date().toISOString()
      });
      await setDoc(doc(db, `stores/${demoSlug}/inventory`, 'i2'), {
        id: 'i2', storeId: demoSlug, ownerId: demoUid, name: 'Leite Condensado Itambé',
        quantity: 12, unit: 'un', minStock: 6, createdAt: new Date().toISOString()
      });

      // Seed 1 test order
      await setDoc(doc(db, `stores/${demoSlug}/orders`, 'o1'), {
        id: 'o1', storeId: demoSlug, ownerId: demoUid, orderNumber: '#C4391',
        customerName: 'Rosângela Souza', customerPhone: '11988888888', deliveryType: 'pickup',
        deliveryDateTime: new Date(Date.now() + 86400000).toISOString(), notes: 'Por favor, embalar para presente com fita rosa.',
        items: [{ productId: 'p1', name: 'Bolo Prestígio Supremo', price: 85, quantity: 1 }],
        total: 85, status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });

      setCurrentUser(demoProfile);
      setStore(demoStore);
      setAuthError('');
    } finally {
      setLoading(false);
    }
  };

  // Slug auto format in onboarding wizard
  const handleWizardSlugChange = (val: string) => {
    const formatted = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-_]/g, '-');
    setNewStoreSlug(formatted);
  };

  // Create Store Wizard Onboarding submit
  const handleCreateStoreWizard = async (e: FormEvent) => {
    e.preventDefault();
    setWizardError('');
    if (!currentUser || !newStoreName || !newStoreSlug) return;

    try {
      setLoading(true);
      // Double check if slug already exists in stores database
      const slugDoc = await getDoc(doc(db, 'stores', newStoreSlug));
      if (slugDoc.exists()) {
        setWizardError('Este link/slug já está em uso por outra confeiteira. Escolha outro.');
        setLoading(false);
        return;
      }

      // Create new Store Document
      const storePayload: StoreConfig = {
        id: newStoreSlug,
        ownerId: currentUser.uid,
        slug: newStoreSlug,
        name: newStoreName,
        description: 'Bem-vindo ao nosso cardápio online! Faça suas encomendas de doces e bolos com facilidade.',
        address: '',
        workingHours: 'Segunda a Sábado: 9h às 18h',
        whatsapp: '',
        instagram: '',
        logoUrl: PRESET_AVATARS[0].url,
        coverUrl: PRESET_COVERS[0].url,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'stores', newStoreSlug), storePayload);
      
      // Update user Profile with their newly created store slug reference
      await setDoc(doc(db, 'users', currentUser.uid), {
        ...currentUser,
        storeId: newStoreSlug
      });

      setCurrentUser(prev => prev ? { ...prev, storeId: newStoreSlug } : null);
      setStore(storePayload);
    } catch (err) {
      console.error(err);
      setWizardError('Ocorreu um erro ao inicializar sua loja. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#D4A373] mx-auto"></div>
          <p className="text-[#A69C91] text-xs font-bold tracking-wider uppercase">Carregando ConfeitaPro...</p>
        </div>
      </div>
    );
  }

  // Render Public Customer View if matching /store/{slug}
  if (publicSlug) {
    return <PublicStoreView slug={publicSlug} />;
  }

  // Render Login view if guest
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col md:flex-row">
        {/* Left Hero Brand Panel */}
        <div className="flex-1 bg-[#F5F2EB] border-r border-[#EBE9E1] p-10 flex flex-col justify-between text-[#4A3F35] md:max-w-md lg:max-w-lg shadow-xs">
          <div className="flex items-center gap-2.5">
            <Cake className="w-8 h-8 text-[#D4A373]" />
            <h1 className="text-xl font-bold tracking-tight uppercase">ConfeitaPro <span className="text-[10px] bg-[#4A3F35]/10 border border-[#4A3F35]/10 text-[#4A3F35] px-1.5 py-0.5 rounded-md font-bold">AI</span></h1>
          </div>

          <div className="space-y-6 my-12">
            <h2 className="text-4xl font-serif italic text-[#4A3F35] tracking-tight leading-tight">O sistema mais doce e simples para gerenciar sua confeitaria.</h2>
            <p className="text-[#A69C91] text-sm leading-relaxed max-w-sm">Receba pedidos online, controle ingredientes, gerencie sua agenda e encante clientes através do WhatsApp.</p>
            
            <div className="space-y-3.5 pt-4">
              <div className="flex items-center gap-3 text-sm text-[#4A3F35] font-semibold">
                <span className="p-1.5 bg-white/50 border border-[#EBE9E1] rounded-lg">✓</span>
                <span>Página própria para receber pedidos</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-[#4A3F35] font-semibold">
                <span className="p-1.5 bg-white/50 border border-[#EBE9E1] rounded-lg">✓</span>
                <span>Controle rápido de estoque</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-[#4A3F35] font-semibold">
                <span className="p-1.5 bg-white/50 border border-[#EBE9E1] rounded-lg">✓</span>
                <span>Agenda integrada de entregas</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-[#A69C91] font-semibold">
            ConfeitaPro AI © 2026. Todos os direitos reservados.
          </div>
        </div>

        {/* Right Form Authentication Panel */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-[2rem] border border-[#EBE9E1] shadow-xl">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-serif italic text-[#4A3F35] tracking-tight">{isSignUp ? 'Criar minha Conta' : 'Acessar Plataforma'}</h3>
              <p className="text-xs text-[#A69C91] font-semibold">Cadastre-se para abrir sua confeitaria online em segundos.</p>
            </div>

            {authError && (
              <div className="space-y-4">
                <div className="p-3.5 bg-red-50 border border-red-100 text-red-700 text-xs font-semibold rounded-xl text-center animate-pulse">
                  {authError}
                </div>
                
                {authError.includes('auth/operation-not-allowed') && (
                  <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-2xl space-y-3 shadow-xs">
                    <p className="font-bold flex items-center gap-1.5 text-amber-900">
                      ⚠️ ATIVE O MÉTODO DE LOGIN NO FIREBASE:
                    </p>
                    <p className="text-stone-600 leading-relaxed font-medium text-[11px]">
                      O Firebase vem com todos os métodos de login desativados por padrão. Siga estes passos simples para ativar e liberar o acesso:
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5 text-stone-700 font-medium pl-1 text-[11px]">
                      <li>Acesse o <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold text-[#D4A373] hover:text-[#4A3F35]">Console do Firebase</a></li>
                      <li>Clique no seu projeto <strong>ai-studio-...</strong></li>
                      <li>No menu esquerdo, vá em <strong>Build (Construir) &gt; Authentication</strong></li>
                      <li>Clique na aba <strong>Sign-in method (Método de login)</strong></li>
                      <li>Clique em <strong>Add new provider (Adicionar novo provedor)</strong></li>
                      <li>Selecione <strong>Email/Password (E-mail/Senha)</strong></li>
                      <li>Ative a primeira opção (Habilitar) e clique em <strong>Salvar</strong></li>
                    </ol>
                    <p className="text-[10px] text-stone-500 italic leading-snug">
                      Dica: Se você deseja habilitar o Google Login, faça o mesmo processo para o provedor "Google".
                    </p>
                    <div className="pt-2.5 border-t border-amber-200">
                      <button
                        type="button"
                        onClick={handleLaunchDemoMode}
                        className="w-full bg-[#D4A373] hover:bg-[#c39262] text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5 animate-pulse text-white" />
                        Ignorar e Entrar no Modo de Demonstração Offline (Local)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="space-y-4">
              {isSignUp && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#4A3F35] uppercase tracking-wider block">Seu Nome</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-[#A69C91]" />
                    <input
                      type="text"
                      required
                      placeholder="Ex: Maria Brigadeiros"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none text-sm transition"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#4A3F35] uppercase tracking-wider block">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-[#A69C91]" />
                  <input
                    type="email"
                    required
                    placeholder="voce@confeitaria.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none text-sm transition"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#4A3F35] uppercase tracking-wider block">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-[#A69C91]" />
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none text-sm transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#4A3F35] hover:bg-[#5A4F44] text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {isSignUp ? 'Criar minha Conta' : 'Acessar Painel'} <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-[#EBE9E1]"></div>
              <span className="flex-shrink mx-4 text-[#A69C91] text-[10px] font-bold uppercase tracking-wider">OU ACESSE COM</span>
              <div className="flex-grow border-t border-[#EBE9E1]"></div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full bg-white border border-[#EBE9E1] text-[#4A3F35] hover:bg-[#FAF9F6] font-bold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                <Globe className="w-4 h-4 text-red-500" /> Google Login
              </button>

              {/* Evaluation Direct Demo Drive */}
              <button
                type="button"
                onClick={handleLaunchDemoMode}
                className="w-full bg-[#FAF9F6] hover:bg-[#F5F2EB] text-[#D4A373] font-bold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 border border-[#EBE9E1]"
              >
                <Sparkles className="w-4 h-4 text-[#D4A373]" /> Entrar como Demonstrativo (Teste Instantâneo)
              </button>
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-[#D4A373] font-bold text-xs hover:underline transition"
              >
                {isSignUp ? 'Já tem conta? Faça Login' : 'Não tem conta? Cadastre-se'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Onboarding Wizard view: If logged in but doesn't have a store initialized yet
  if (!store && currentUser.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
        <div className="bg-white rounded-[2rem] max-w-md w-full p-8 border border-[#EBE9E1] shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="p-4 bg-[#FAF9F6] border border-[#EBE9E1] rounded-full w-16 h-16 flex items-center justify-center mx-auto text-[#D4A373]">
              <Cake className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-serif italic text-[#4A3F35] tracking-tight">Crie sua Confeitaria</h3>
            <p className="text-sm text-[#A69C91] leading-normal font-medium">Escolha o nome comercial e o link exclusivo de divulgação do seu negócio.</p>
          </div>

          {wizardError && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-xs font-semibold rounded-xl text-center">
              {wizardError}
            </div>
          )}

          <form onSubmit={handleCreateStoreWizard} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#4A3F35] uppercase tracking-wider block">Nome Comercial *</label>
              <input
                type="text"
                required
                placeholder="Ex: Maria Bolos Caseiros"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#4A3F35] uppercase tracking-wider block">Seu Link Exclusivo (slug) *</label>
              <div className="flex items-center">
                <span className="bg-[#F5F2EB] border border-r-0 border-[#EBE9E1] px-3 py-2.5 rounded-l-xl text-xs text-[#A69C91] font-bold">confeitapro/</span>
                <input
                  type="text"
                  required
                  placeholder="mariabolos"
                  value={newStoreSlug}
                  onChange={(e) => handleWizardSlugChange(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-r-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
                />
              </div>
              <span className="text-[9px] text-[#A69C91] font-semibold block mt-1">Insira letras minúsculas e números sem hifens ou espaços.</span>
            </div>

            <button
              type="submit"
              className="w-full bg-[#4A3F35] hover:bg-[#5A4F44] text-white font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              Criar Minha Confeitaria <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="text-center">
            <button onClick={handleLogout} className="text-xs text-[#A69C91] hover:text-[#4A3F35] font-bold underline transition-all">
              Sair da Conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Platform Navigation Config
  const isSuperAdmin = currentUser.role === 'admin';
  const menuTabs = [
    { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
    { id: 'orders', label: 'Encomendas', icon: ShoppingBag },
    { id: 'products', label: 'Cardápio', icon: Package },
    { id: 'agenda', label: 'Agenda', icon: Calendar },
    { id: 'inventory', label: 'Estoque', icon: ClipboardList },
    { id: 'settings', label: 'Minha Loja', icon: Store },
  ];

  if (isSuperAdmin) {
    // Admins only see Super administration tabs
    menuTabs.push({ id: 'admin', label: 'Administração', icon: ShieldCheck });
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView storeId={store?.id || ''} onNavigate={setActiveTab} />;
      case 'products':
        return <ProductsView storeId={store?.id || ''} ownerId={currentUser.uid} />;
      case 'orders':
        return <OrdersView storeId={store?.id || ''} />;
      case 'agenda':
        return <AgendaView storeId={store?.id || ''} />;
      case 'inventory':
        return <InventoryView storeId={store?.id || ''} ownerId={currentUser.uid} />;
      case 'settings':
        return <StoreSettingsView storeId={store?.id || ''} onStoreUpdated={setStore} />;
      case 'admin':
        return isSuperAdmin ? <AdminView /> : <DashboardView storeId={store?.id || ''} onNavigate={setActiveTab} />;
      default:
        return <DashboardView storeId={store?.id || ''} onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col md:flex-row">
      
      {/* Mobile Header Menu Navigation */}
      <div className="md:hidden bg-white border-b border-[#EBE9E1] p-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <Cake className="w-6 h-6 text-[#D4A373]" />
          <span className="font-serif italic text-[#4A3F35] tracking-tight text-sm uppercase">ConfeitaPro <span className="text-[9px] bg-[#FAF9F6] border border-[#EBE9E1] text-[#D4A373] font-bold px-1.5 py-0.5 rounded-md">AI</span></span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1 text-[#4A3F35] hover:text-[#D4A373] transition-all"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <div className={`
        fixed inset-y-0 left-0 transform md:relative md:translate-x-0 transition duration-200 ease-in-out z-30
        w-64 bg-white border-r border-[#EBE9E1] p-6 flex flex-col justify-between flex-shrink-0 shadow-xs
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:block'}
      `}>
        <div className="space-y-8">
          {/* Brand header */}
          <div className="hidden md:flex items-center gap-2 pb-3 border-b border-[#FAF9F6]">
            <Cake className="w-7 h-7 text-[#D4A373]" />
            <div>
              <h1 className="font-serif italic text-[#4A3F35] tracking-tight text-lg leading-none">ConfeitaPro</h1>
              <p className="text-[10px] text-[#D4A373] font-bold tracking-wider uppercase mt-1">Gestão Doce AI</p>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="space-y-1">
            {menuTabs.map((tab) => {
              const IconComp = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-[#4A3F35] text-white shadow-sm font-bold'
                      : 'text-[#A69C91] hover:text-[#4A3F35] hover:bg-[#FAF9F6]'
                  }`}
                >
                  <IconComp className="w-4.5 h-4.5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Account Details Footer */}
        <div className="pt-6 border-t border-[#FAF9F6] space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FAF9F6] border border-[#EBE9E1] flex items-center justify-center text-[#D4A373] font-bold text-sm">
              {currentUser.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="font-bold text-[#4A3F35] text-xs truncate leading-none">{currentUser.name}</p>
              <p className="text-[10px] text-[#A69C91] truncate mt-1">{currentUser.email}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FAF9F6] hover:bg-[#F5F2EB] text-[#4A3F35] border border-[#EBE9E1] font-bold text-xs rounded-xl transition-all"
          >
            <LogOut className="w-4 h-4" /> Sair do Sistema
          </button>
        </div>

      </div>

      {/* Main Panel Area content scroll */}
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto max-h-screen">
        <main className="max-w-6xl mx-auto">
          {renderActiveView()}
        </main>
      </div>

    </div>
  );
}
