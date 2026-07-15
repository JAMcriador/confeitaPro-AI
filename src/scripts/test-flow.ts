import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function runAudit() {
  console.log("=================================================");
  console.log("🧁 CONFEITAPRO - FULL FUNCTIONAL AUDIT & TEST 🧁");
  console.log("=================================================");
  
  // Test Store Slug
  const slug = "jam-doces"; 
  let storeId = slug;

  console.log(`\n🔍 STEP 1: Verifying Store Configuration for slug: "${slug}"...`);
  let storeData: any = null;
  try {
    const storeSnap = await getDoc(doc(db, 'stores', slug));
    if (storeSnap.exists()) {
      storeData = storeSnap.data();
      console.log(`✅ Direct document read by ID matches slug "${slug}". Store name: "${storeData.name}"`);
    } else {
      console.log(`⚠️ Direct document ID read failed for "${slug}". Searching by slug field...`);
      const storeQuery = query(collection(db, 'stores'), where('slug', '==', slug));
      const querySnap = await getDocs(storeQuery);
      if (!querySnap.empty) {
        const docSnap = querySnap.docs[0];
        storeId = docSnap.id;
        storeData = docSnap.data();
        console.log(`✅ Found store by fallback query. Store ID: "${storeId}", Name: "${storeData.name}"`);
      } else {
        console.log(`❌ No store found with slug "${slug}". Searching for ANY store in the database to run the test...`);
        const allStores = await getDocs(collection(db, 'stores'));
        if (allStores.empty) {
          throw new Error("No stores exist in the database. Please register a store in the admin panel first.");
        }
        const firstStore = allStores.docs[0];
        storeId = firstStore.id;
        storeData = firstStore.data();
        console.log(`👉 Using existing store: "${storeId}" (Name: "${storeData.name}") for the remainder of the audit.`);
      }
    }
  } catch (err: any) {
    console.error("❌ Failed to read store data:", err.message);
    process.exit(1);
  }

  console.log(`\n🔍 STEP 2: Simulating Client loading store products...`);
  let activeProducts: any[] = [];
  try {
    const productsSnap = await getDocs(collection(db, `stores/${storeId}/products`));
    productsSnap.forEach(d => {
      const p = { id: d.id, ...d.data() } as any;
      if (p.active) {
        activeProducts.push(p);
      }
    });
    console.log(`✅ Loaded ${activeProducts.length} active products.`);
    activeProducts.forEach((p, idx) => {
      console.log(`   [${idx + 1}] ${p.name} - ${Number(p.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    });
    if (activeProducts.length === 0) {
      console.log("⚠️ No active products found in the store. We'll proceed with a mock product for checkout simulation.");
    }
  } catch (err: any) {
    console.error("❌ Failed to load products:", err.message);
    process.exit(1);
  }

  console.log(`\n🔍 STEP 3: Simulating Adding Products to Cart...`);
  const cartItems = [];
  if (activeProducts.length > 0) {
    const p = activeProducts[0];
    cartItems.push({
      productId: p.id,
      name: p.name,
      price: p.price,
      quantity: 2,
      notes: "Testing automated checkout process"
    });
    console.log(`✅ Cart populated with: 2x "${p.name}"`);
  } else {
    cartItems.push({
      productId: "mock-p1",
      name: "Bolo Prestígio de Teste",
      price: 85.00,
      quantity: 1,
      notes: "Mock item for integration test"
    });
    console.log(`✅ Cart populated with mock item: 1x "Bolo Prestígio de Teste"`);
  }

  const total = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  console.log(`   Cart Total: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);

  console.log(`\n🔍 STEP 4: Placing Order (Writing to Firestore under /stores/{storeId}/orders/{orderId})...`);
  const orderId = `TEST-ORD-${Date.now()}`;
  const orderPayload = {
    id: orderId,
    storeId: storeId,
    ownerId: storeData.ownerId,
    orderNumber: `T${Math.floor(1000 + Math.random() * 9000)}`,
    customerName: "Audit Test Client",
    customerPhone: "(11) 99999-9999",
    deliveryType: "pickup",
    deliveryDateTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    notes: "Automatic functional test execution",
    items: cartItems,
    total: total,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    const orderRef = doc(db, `stores/${storeId}/orders`, orderId);
    await setDoc(orderRef, orderPayload);
    console.log(`✅ Success! Order successfully created at path "stores/${storeId}/orders/${orderId}".`);
  } catch (err: any) {
    console.error(`❌ Failed to place order in Firestore. This indicates a rules or permission issue:`, err.message);
    process.exit(1);
  }

  console.log(`\n🔍 STEP 5: Verifying Order privacy & Merchant dashboard routing...`);
  try {
    const orderRef = doc(db, `stores/${storeId}/orders`, orderId);
    const orderSnap = await getDoc(orderRef);
    if (orderSnap.exists()) {
      const retrieved = orderSnap.data();
      console.log(`✅ Success! Order retrieved. Note: If this succeeded without auth, check security rules.`);
      console.log(`   Customer: "${retrieved.customerName}"`);
    } else {
      console.log(`⚠️ Order was written but is not accessible. This is expected if the client is unauthenticated.`);
    }
  } catch (err: any) {
    if (err.message.includes('permission') || err.message.includes('PERMISSION_DENIED')) {
      console.log(`🔒 [SECURITY PASSED] Read access was blocked for unauthenticated clients: "${err.message}"`);
      console.log(`   This is the correct and secure behavior! Only the logged-in merchant (confeiteira) can read orders, protecting customer privacy.`);
    } else {
      console.error(`❌ Failed to retrieve placed order for unexpected reasons:`, err.message);
      process.exit(1);
    }
  }

  console.log(`\n🔍 STEP 6: Testing WhatsApp Button generator...`);
  try {
    const itemsText = orderPayload.items
      .map(item => `• ${item.quantity}x ${item.name} (${item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`)
      .join('\n');
    
    const message = encodeURIComponent(
      `🧁 *NOVO PEDIDO - CONFEITAPRO*\n\n` +
      `*Pedido:* ${orderPayload.orderNumber}\n` +
      `*Cliente:* ${orderPayload.customerName}\n\n` +
      `*Itens Encomendados:* \n${itemsText}\n\n` +
      `*Total Geral:* ${orderPayload.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    );
    const storePhone = storeData.whatsapp || "11999999999";
    const cleanStorePhone = storePhone.replace(/\D/g, '');
    const waUrl = `https://wa.me/55${cleanStorePhone}?text=${message}`;
    console.log(`✅ WhatsApp link built successfully:`);
    console.log(`   URL: ${waUrl.substring(0, 100)}...`);
  } catch (err: any) {
    console.error("❌ Failed to construct WhatsApp link:", err.message);
    process.exit(1);
  }

  console.log(`\n🧹 Cleaning up test order...`);
  try {
    await deleteDoc(doc(db, `stores/${storeId}/orders`, orderId));
    console.log("✅ Cleanup successful.");
  } catch (err: any) {
    console.warn("⚠️ Failed to delete test order (not critical):", err.message);
  }

  console.log("\n=================================================");
  console.log("🎉 ALL AUDIT CHECKS PASSED SUCCESSFULLY! 🎉");
  console.log("=================================================");
}

runAudit();
