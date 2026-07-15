export interface PresetAsset {
  id: string;
  name: string;
  url: string;
}

export const PRESET_AVATARS: PresetAsset[] = [
  { id: 'cake-choc', name: 'Bolo de Chocolate', url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&auto=format&fit=crop&q=80' },
  { id: 'cupcake-pink', name: 'Cupcake Rosa', url: 'https://images.unsplash.com/photo-1576618148400-f54bed99fcfd?w=400&auto=format&fit=crop&q=80' },
  { id: 'macarons', name: 'Macarons Coloridos', url: 'https://images.unsplash.com/photo-1569864358642-9d1684040f43?w=400&auto=format&fit=crop&q=80' },
  { id: 'donut-strawberry', name: 'Donut de Morango', url: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400&auto=format&fit=crop&q=80' },
  { id: 'brigadeiros', name: 'Brigadeiros Gourmet', url: 'https://images.unsplash.com/photo-1548848221-0c2e497ed557?w=400&auto=format&fit=crop&q=80' },
  { id: 'croissant', name: 'Croissant Dourado', url: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&auto=format&fit=crop&q=80' },
];

export const PRESET_COVERS: PresetAsset[] = [
  { id: 'kitchen-pastel', name: 'Cozinha Pastel', url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=1000&auto=format&fit=crop&q=80' },
  { id: 'baking-table', name: 'Mesa de Preparo', url: 'https://images.unsplash.com/photo-1517433456452-f9633a875f6f?w=1000&auto=format&fit=crop&q=80' },
  { id: 'cake-showcase', name: 'Vitrine de Bolos', url: 'https://images.unsplash.com/photo-1519869325930-281384150729?w=1000&auto=format&fit=crop&q=80' },
  { id: 'chocolate-pour', name: 'Calda de Chocolate', url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=1000&auto=format&fit=crop&q=80' },
];

export const PRESET_PRODUCTS: PresetAsset[] = [
  { id: 'p-bolo-ninho', name: 'Bolo Ninho com Morango', url: 'https://images.unsplash.com/photo-1535141192574-5d4897c13636?w=600&auto=format&fit=crop&q=80' },
  { id: 'p-bolo-cenoura', name: 'Bolo de Cenoura com Chocolate', url: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=600&auto=format&fit=crop&q=80' },
  { id: 'p-cupcake-red', name: 'Cupcake Red Velvet', url: 'https://images.unsplash.com/photo-1614707267537-b85acf00c4b8?w=600&auto=format&fit=crop&q=80' },
  { id: 'p-brigadeiro-box', name: 'Caixa de Brigadeiros Sortidos', url: 'https://images.unsplash.com/photo-1548848221-0c2e497ed557?w=600&auto=format&fit=crop&q=80' },
  { id: 'p-torta-limao', name: 'Torta de Limão Siciliano', url: 'https://images.unsplash.com/photo-1519869325930-281384150729?w=600&auto=format&fit=crop&q=80' },
  { id: 'p-brownie', name: 'Brownie de Chocolate Belga', url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80' },
];
