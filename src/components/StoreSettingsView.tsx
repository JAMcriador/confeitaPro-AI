import { useState, useEffect, FormEvent, ChangeEvent, MouseEvent } from 'react';
import { db, handleFirestoreError, OperationType, doc, getDoc, setDoc, updateDoc } from '../firebase';
import { StoreConfig } from '../types';
import { PRESET_AVATARS, PRESET_COVERS } from '../utils/assets';
import { Save, Link, Globe, Instagram, MapPin, Clock, Phone, Camera, Check, Copy, X } from 'lucide-react';

interface StoreSettingsViewProps {
  storeId: string;
  onStoreUpdated: (updatedStore: StoreConfig) => void;
}

export default function StoreSettingsView({ storeId, onStoreUpdated }: StoreSettingsViewProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [store, setStore] = useState<StoreConfig | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [workingHours, setWorkingHours] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [instagram, setInstagram] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');

  const [copiedQuery, setCopiedQuery] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  const [showLinkInfoModal, setShowLinkInfoModal] = useState(false);
  const [modalLink, setModalLink] = useState('');
  const [modalType, setModalType] = useState<'query' | 'hash'>('query');
  const [copiedModal, setCopiedModal] = useState(false);

  const handleVisualizarClick = (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>, url: string, type: 'query' | 'hash') => {
    e.preventDefault();
    navigator.clipboard.writeText(url);
    setModalLink(url);
    setModalType(type);
    setShowLinkInfoModal(true);
    
    try {
      window.open(url, '_blank');
    } catch (err) {
      console.warn("Popup blocked:", err);
    }
  };

  const copyModalLink = () => {
    navigator.clipboard.writeText(modalLink);
    setCopiedModal(true);
    setTimeout(() => setCopiedModal(false), 2000);
  };

  useEffect(() => {
    async function loadStore() {
      try {
        setLoading(true);
        const path = `stores/${storeId}`;
        const snap = await getDoc(doc(db, 'stores', storeId));
        if (snap.exists()) {
          const data = snap.data() as StoreConfig;
          setStore(data);
          setName(data.name || '');
          setSlug(data.slug || '');
          setDescription(data.description || '');
          setAddress(data.address || '');
          setWorkingHours(data.workingHours || '');
          setWhatsapp(data.whatsapp || '');
          setInstagram(data.instagram || '');
          setLogoUrl(data.logoUrl || PRESET_AVATARS[0].url);
          setCoverUrl(data.coverUrl || PRESET_COVERS[0].url);
        }
      } catch (error) {
        console.error("Error loading store config:", error);
      } finally {
        setLoading(false);
      }
    }
    if (storeId) {
      loadStore();
    }
  }, [storeId]);

  // Handle URL friendly slug conversion
  const handleSlugChange = (val: string) => {
    const formatted = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9-_]/g, '-'); // replace special characters/spaces with hyphens
    setSlug(formatted);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !slug) return;

    try {
      setSaving(true);
      const path = `stores/${storeId}`;

      const payload: Partial<StoreConfig> = {
        name,
        slug,
        description,
        address,
        workingHours,
        whatsapp,
        instagram,
        logoUrl,
        coverUrl
      };

      await updateDoc(doc(db, 'stores', storeId), payload);
      
      const fullStore = { ...store, ...payload } as StoreConfig;
      setStore(fullStore);
      onStoreUpdated(fullStore);

      alert("Configurações da loja salvas com sucesso! ✨");
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `stores/${storeId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUploadSimulated = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCoverUploadSimulated = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Get absolute links - using both query parameter and hash routing for maximum compatibility
  // Crucial fix: convert 'ais-dev-' to 'ais-pre-' so the copied link is always the public preview URL (accessible from any device!)
  const getPublicUrlQuery = () => {
    let origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }
    return `${origin}/?store=${slug}`;
  };

  const getPublicUrlHash = () => {
    let origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }
    return `${origin}/#/store/${slug}`;
  };

  const urlQuery = getPublicUrlQuery();
  const urlHash = getPublicUrlHash();

  const copyQuery = () => {
    navigator.clipboard.writeText(urlQuery);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2000);
  };

  const copyHash = () => {
    navigator.clipboard.writeText(urlHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-natural-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header Panel */}
      <div>
        <h2 className="text-3xl font-serif italic text-[#4A3F35]">Personalizar Minha Loja</h2>
        <p className="text-sm text-[#A69C91]">Configure as fotos, mídias sociais e link público de recebimento de encomendas.</p>
      </div>

      {/* Public Links Card */}
      <div className="space-y-4">
        {/* Link 1: Recommended Query Link */}
        <div className="bg-[#F5F2EB] rounded-[2rem] border border-[#EBE9E1] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1 flex-1">
            <span className="text-[#D4A373] font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-[#D4A373]" /> Link Recomendado (Ideal para WhatsApp)
            </span>
            <p className="text-[#4A3F35] text-sm font-semibold select-all break-all">{urlQuery}</p>
            <p className="text-[11px] text-[#A69C91]">Evita erros de "Página não encontrada" em qualquer dispositivo ou aparelho celular.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto self-stretch md:self-auto justify-end">
            <button
              type="button"
              onClick={copyQuery}
              className="flex-1 md:flex-initial bg-white border border-[#EBE9E1] text-[#4A3F35] hover:bg-[#FAF9F6] font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap shadow-xs"
            >
              {copiedQuery ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              {copiedQuery ? 'Copiado!' : 'Copiar Link'}
            </button>
            <a
              href={urlQuery}
              onClick={(e) => handleVisualizarClick(e, urlQuery, 'query')}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 md:flex-initial bg-[#4A3F35] hover:bg-[#5A4F44] text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap shadow-xs"
            >
              <Link className="w-4 h-4" /> Visualizar
            </a>
          </div>
        </div>

        {/* Link 2: Short Hash Link */}
        <div className="bg-[#FAF9F6] rounded-[2rem] border border-[#EBE9E1]/80 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1 flex-1">
            <span className="text-[#A69C91] font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Link className="w-4 h-4 text-[#A69C91]" /> Link Alternativo (Hash SPA)
            </span>
            <p className="text-[#4A3F35] text-xs font-semibold select-all break-all">{urlHash}</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto self-stretch md:self-auto justify-end">
            <button
              type="button"
              onClick={copyHash}
              className="flex-1 md:flex-initial bg-white border border-[#EBE9E1] text-[#4A3F35] hover:bg-[#FAF9F6] font-bold text-[11px] px-3.5 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs"
            >
              {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedHash ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
        
        {/* Info Alert explaining why some devices had issues before */}
        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 text-xs text-amber-900 leading-relaxed space-y-2">
          <p className="font-bold flex items-center gap-1.5 text-amber-800">
            💡 Informações importantes sobre os links:
          </p>
          <p>
            1. <strong>Por que dava erro antes?</strong> O link de desenvolvimento (contendo <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px]">ais-dev-</code>) é privado para o administrador. Para clientes e outros aparelhos, você <strong>deve sempre usar</strong> um dos links públicos acima contendo <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px]">ais-pre-</code>.
          </p>
          <p>
            2. <strong>Qual escolher?</strong> O <strong>Link Recomendado (com ?store=)</strong> é o mais robusto. Ele evita o erro "Página não encontrada" (404) em 100% das vezes, pois carrega diretamente a raiz do servidor e faz a leitura do seu identificador de loja.
          </p>
        </div>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSave} className="bg-white rounded-[2rem] border border-[#EBE9E1] shadow-sm overflow-hidden">
        {/* Cover Preview Image Selection */}
        <div className="relative h-48 bg-zinc-100">
          <img src={coverUrl || PRESET_COVERS[0].url} alt="Cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/20" />
          
          <div className="absolute bottom-4 right-4">
            <input
              type="file"
              accept="image/*"
              id="upload-cover-img"
              onChange={handleCoverUploadSimulated}
              className="hidden"
            />
            <label
              htmlFor="upload-cover-img"
              className="cursor-pointer bg-white/95 hover:bg-white text-[#4A3F35] font-bold text-xs px-3 py-1.5 rounded-lg shadow-xs transition-all flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" /> Trocar Capa
            </label>
          </div>

          {/* Logo / Profile floating */}
          <div className="absolute -bottom-8 left-6 w-20 h-20 rounded-[1.25rem] border-4 border-white bg-white overflow-hidden shadow-md">
            <img src={logoUrl || PRESET_AVATARS[0].url} alt="Logo" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/15 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <input
                type="file"
                accept="image/*"
                id="upload-logo-img"
                onChange={handleAvatarUploadSimulated}
                className="hidden"
              />
              <label htmlFor="upload-logo-img" className="cursor-pointer text-white">
                <Camera className="w-5 h-5" />
              </label>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-8 pt-14 space-y-6">
          
          {/* Preset Images Selections */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#FAF9F6] border border-[#EBE9E1]/60 rounded-2xl p-5">
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-[#A69C91] uppercase tracking-wider block">PRESETS DE PERFIL (CONFEITEIRA)</span>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setLogoUrl(avatar.url)}
                    className={`w-9 h-9 rounded-lg overflow-hidden border-2 transition-all ${
                      logoUrl === avatar.url ? 'border-[#D4A373] scale-90' : 'border-transparent'
                    }`}
                  >
                    <img src={avatar.url} alt={avatar.name} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold text-[#A69C91] uppercase tracking-wider block">PRESETS DE BANNER</span>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COVERS.map((cover) => (
                  <button
                    key={cover.id}
                    type="button"
                    onClick={() => setCoverUrl(cover.url)}
                    className={`w-11 h-7 rounded-lg overflow-hidden border-2 transition-all ${
                      coverUrl === cover.url ? 'border-[#D4A373] scale-90' : 'border-transparent'
                    }`}
                  >
                    <img src={cover.url} alt={cover.name} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Text fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider">Nome da Loja *</label>
              <input
                type="text"
                required
                placeholder="Ex: Maria Bolos e Doces"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider">Identificador da URL (slug) *</label>
              <input
                type="text"
                required
                placeholder="Ex: mariabolos"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
              />
              <span className="text-[10px] text-[#A69C91]">Exclusivo sem acentos ou espaços (Ex: confeitapro/maria-bolos)</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider">Descrição / Biografia</label>
            <textarea
              rows={3}
              placeholder="Fale um pouco sobre as delícias que você prepara, sua especialidade..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#D4A373]" /> Endereço de Retirada
              </label>
              <input
                type="text"
                placeholder="Ex: Rua das Flores, 123, Centro"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#D4A373]" /> Horário de Funcionamento
              </label>
              <input
                type="text"
                placeholder="Ex: Terça a Domingo: 13h às 19h"
                value={workingHours}
                onChange={(e) => setWorkingHours(e.target.value)}
                className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-[#D4A373]" /> WhatsApp para Atendimento *
              </label>
              <input
                type="text"
                required
                placeholder="DDD + Número (Ex: 11999999999)"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#A69C91] uppercase tracking-wider flex items-center gap-1.5">
                <Instagram className="w-4 h-4 text-[#D4A373]" /> Instagram (@usuario)
              </label>
              <input
                type="text"
                placeholder="Ex: @mariadoces"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                className="w-full px-4 py-3 text-sm bg-[#FAF9F6] border border-[#EBE9E1] rounded-xl focus:border-[#D4A373] focus:bg-white outline-none transition"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end pt-6 border-t border-[#FAF9F6]">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto bg-[#4A3F35] hover:bg-[#5A4F44] text-white font-bold text-xs uppercase tracking-wider px-6 py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>

        </div>
      </form>

      {/* Dialog overlay for sandboxed iframe popup limits */}
      {showLinkInfoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] border border-[#EBE9E1] p-8 max-w-lg w-full space-y-6 shadow-2xl relative animate-in zoom-in-95 duration-200 text-center">
            
            <button 
              type="button"
              onClick={() => setShowLinkInfoModal(false)}
              className="absolute top-6 right-6 p-2 text-[#A69C91] hover:text-[#4A3F35] rounded-full hover:bg-[#FAF9F6] transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 bg-[#E9EDC6] text-[#5A5A40] rounded-full flex items-center justify-center mx-auto shadow-sm">
              <Globe className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-serif italic text-[#4A3F35]">Link Copiado! 🍰</h3>
              <p className="text-xs text-[#A69C91] font-medium leading-relaxed">
                O link público da sua confeitaria já foi copiado para sua área de transferência.
              </p>
            </div>

            {/* Explanation card */}
            <div className="bg-[#FAF9F6] border border-[#EBE9E1] rounded-2xl p-5 text-left text-xs space-y-3">
              <p className="font-bold text-[#A69C91] tracking-wider text-[9px] uppercase">Por que a nova aba não abriu?</p>
              <p className="text-stone-600 leading-relaxed font-medium">
                Como você está usando o visualizador do <strong>Google AI Studio</strong> (ambiente de desenvolvimento seguro), os navegadores costumam bloquear a abertura de links (pop-ups).
              </p>
              
              <div className="pt-2.5 border-t border-[#EBE9E1] space-y-2">
                <p className="font-bold text-[#4A3F35] flex items-center gap-1">
                  👉 Como visualizar agora:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[#4A3F35] font-semibold pl-1">
                  <li>Abra uma nova aba em seu navegador</li>
                  <li>Cole o link (Ctrl+V ou toque e segure) e dê Enter!</li>
                </ol>
              </div>
            </div>

            {/* Interactive Link Preview Box */}
            <div className="p-3 bg-[#FAF9F6] border border-[#EBE9E1]/80 rounded-xl flex items-center justify-between gap-3 text-left">
              <p className="text-[#4A3F35] text-xs font-mono font-semibold truncate flex-1 select-all">{modalLink}</p>
              <button
                type="button"
                onClick={copyModalLink}
                className="bg-white hover:bg-[#F5F2EB] border border-[#EBE9E1] text-[#4A3F35] px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 shrink-0"
              >
                {copiedModal ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedModal ? 'Copiado!' : 'Copiar'}
              </button>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLinkInfoModal(false)}
                className="bg-stone-100 hover:bg-stone-200 text-[#4A3F35] font-bold py-3.5 px-4 rounded-xl text-xs transition-all uppercase tracking-wider"
              >
                Fechar
              </button>
              
              <button
                type="button"
                onClick={() => {
                  window.location.href = modalLink;
                }}
                className="bg-[#4A3F35] hover:bg-[#5A4F44] text-white font-bold py-3.5 px-4 rounded-xl text-xs transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Link className="w-4 h-4" /> Ver nesta Tela
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
