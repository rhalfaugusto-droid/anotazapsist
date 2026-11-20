/**
 * ============================================================================
 * COMUNICANOTES - SISTEMA DE ANOTAÇÕES E COMUNICADOS VIA WHATSAPP
 * Arquitetura: 100% Client-Side (Vanilla JS + LocalStorage)
 * ============================================================================
 */

(() => {
  'use strict';

  // Chaves do LocalStorage
  const STORAGE_KEYS = {
    NOTES: 'cn_notes_v1',
    CATEGORIES: 'cn_categories_v1',
    RECIPIENTS: 'cn_recipients_v1',
    HISTORY: 'cn_history_v1'
  };

  // Tempo obrigatório de bloqueio antes de permitir confirmação (segundos)
  const LOCK_SECONDS = 60;

  // Categorias padrão iniciais
  const DEFAULT_CATEGORIES = [
    { id: 'cat-1', name: 'Comunicado', color: '#2563eb' },
    { id: 'cat-2', name: 'Aviso', color: '#0284c7' },
    { id: 'cat-3', name: 'Urgente', color: '#dc2626' },
    { id: 'cat-4', name: 'Manutenção', color: '#d97706' },
    { id: 'cat-5', name: 'Financeiro', color: '#16a34a' },
    { id: 'cat-6', name: 'Operacional', color: '#7c3aed' },
    { id: 'cat-7', name: 'Informativo', color: '#0d9488' },
    { id: 'cat-8', name: 'Outros', color: '#475569' }
  ];

  // Estado em memória
  let state = {
    notes: [],
    categories: [],
    recipients: [],
    history: []
  };

  let countdownInterval = null;

  // ==========================================================================
  // UTILITÁRIOS DE SEGURANÇA, DATA E ARMAZENAMENTO
  // ==========================================================================

  /** Sanitiza strings para prevenir XSS ao renderizar no DOM */
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /** Gera identificador único seguro */
  function generateUID(prefix = 'MSG') {
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${randomPart}`;
  }

  /** Formata data/hora BR */
  function formatDateTime(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /** Formata apenas data YYYY-MM-DD para DD/MM/YYYY */
  function formatDateBR(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('T')) {
      return new Date(dateStr).toLocaleDateString('pt-BR');
    }
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  }

  /** Lê dados do LocalStorage com tratamento de erro e validação */
  function loadFromStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (err) {
      console.error(`Erro ao ler ${key}:`, err);
      showToast('Aviso: Dados corrompidos detectados no navegador e restaurados.', 'warning');
      return fallback;
    }
  }

  /** Salva dados no LocalStorage com tratamento de cota */
  function saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error(`Erro ao salvar ${key}:`, err);
      showToast('Erro crítico: Limite de armazenamento local atingido!', 'error');
      return false;
    }
  }

  function persistAll() {
    saveToStorage(STORAGE_KEYS.NOTES, state.notes);
    saveToStorage(STORAGE_KEYS.CATEGORIES, state.categories);
    saveToStorage(STORAGE_KEYS.RECIPIENTS, state.recipients);
    saveToStorage(STORAGE_KEYS.HISTORY, state.history);
  }

  /** Exibe notificação Toast */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  // ==========================================================================
  // INICIALIZAÇÃO E DADOS DEMONSTRATIVOS
  // ==========================================================================

  function initApp() {
    state.categories = loadFromStorage(STORAGE_KEYS.CATEGORIES, null);
    if (!state.categories || state.categories.length === 0) {
      state.categories = [...DEFAULT_CATEGORIES];
      saveToStorage(STORAGE_KEYS.CATEGORIES, state.categories);
    }

    state.notes = loadFromStorage(STORAGE_KEYS.NOTES, []);
    state.recipients = loadFromStorage(STORAGE_KEYS.RECIPIENTS, []);
    state.history = loadFromStorage(STORAGE_KEYS.HISTORY, []);

    // Verifica se é a primeira execução absoluta para oferecer dados demo
    if (!localStorage.getItem('cn_initialized')) {
      seedDemoData(false);
      localStorage.setItem('cn_initialized', 'true');
    }

    evaluateOverdueNotes();
    bindEvents();
    populateCategorySelects();
    populateRecipientSelect();

    // Verifica se a URL contém parâmetro de confirmação (?confirmar=ID)
    const params = new URLSearchParams(window.location.search);
    const confirmNoteId = params.get('confirmar');

    if (confirmNoteId) {
      openConfirmationScreen(confirmNoteId);
    } else {
      switchView('dashboard');
      renderAll();
    }

    startCountdownLoop();
  }

  function seedDemoData(notify = true) {
    const now = new Date().toISOString();
    const demoRecipients = [
      { id: 'rec-1', name: 'Grupo Operações TI', phone: '' },
      { id: 'rec-2', name: 'Coordenação Financeira', phone: '5511999998888' }
    ];

    const demoNotes = [
      {
        id: generateUID('COM'),
        title: 'Atualização do Sistema ERP - Janela de Manutenção',
        content: 'Prezados, informamos que hoje às 22h00 realizaremos atualização crítica no módulo fiscal.\nO sistema ficará indisponível por aproximadamente 40 minutos.',
        createdAt: now,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        categoryId: 'cat-4',
        system: 'ERP Corporativo',
        recipient: 'Grupo Operações TI',
        phone: '',
        obs: 'Validar backup antes de iniciar.',
        status: 'Aguardando envio',
        shareId: null,
        sharedAt: null,
        confirmedAt: null
      },
      {
        id: generateUID('COM'),
        title: 'Fechamento de Notas Fiscais do Mês',
        content: 'Lembramos a todos os setores que o prazo limite para envio das notas fiscais de serviço encerra-se amanhã às 17h00.',
        createdAt: now,
        dueDate: new Date().toISOString().split('T')[0],
        categoryId: 'cat-3',
        system: 'Portal Financeiro',
        recipient: 'Coordenação Financeira',
        phone: '5511999998888',
        obs: 'Prioridade máxima.',
        status: 'Aguardando envio',
        shareId: null,
        sharedAt: null,
        confirmedAt: null
      }
    ];

    state.recipients = [...demoRecipients, ...state.recipients];
    state.notes = [...demoNotes, ...state.notes];
    persistAll();
    populateRecipientSelect();
    renderAll();
    if (notify) showToast('Dados demonstrativos carregados com sucesso!', 'success');
  }

  /** Verifica automaticamente notas vencidas não lidas */
  function evaluateOverdueNotes() {
    const today = new Date().toISOString().split('T')[0];
    let changed = false;

    state.notes.forEach(note => {
      if (
        note.dueDate &&
        note.dueDate < today &&
        note.status !== 'Lido' &&
        note.status !== 'Atrasado'
      ) {
        note.status = 'Atrasado';
        changed = true;
      }
    });

    if (changed) saveToStorage(STORAGE_KEYS.NOTES, state.notes);
  }

  // ==========================================================================
  // NAVEGAÇÃO ENTRE TELAS
  // ==========================================================================

  function switchView(viewName) {
    // Limpa parâmetro ?confirmar da URL ao voltar ao sistema normal
    if (viewName !== 'confirmacao' && window.location.search.includes('confirmar=')) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));

    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove('hidden');

    const navBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (navBtn) navBtn.classList.add('active');

    const titles = {
      'dashboard': 'Painel Principal & Anotações',
      'nova-anotacao': 'Cadastro de Anotação',
      'historico': 'Histórico de Compartilhamentos',
      'categorias': 'Categorias & Destinatários',
      'backup': 'Backup & Restauração (JSON)',
      'confirmacao': 'Confirmação de Leitura'
    };

    document.getElementById('pageTitle').textContent = titles[viewName] || 'ComunicaNotes';
    closeMobileSidebar();

    if (viewName === 'dashboard') renderAll();
    if (viewName === 'historico') renderHistoryTable();
    if (viewName === 'categorias') renderManageLists();
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  }

  // ==========================================================================
  // REGRA DE BLOQUEIO DE 60 SEGUNDOS (VALIDAÇÃO REAL EM JS + UI)
  // ==========================================================================

  /** Retorna quantos segundos restam de bloqueio (0 = liberado) */
  function getRemainingLockSeconds(note) {
    if (!note || !note.sharedAt) return LOCK_SECONDS;
    const sharedTime = new Date(note.sharedAt).getTime();
    if (isNaN(sharedTime)) return LOCK_SECONDS;

    const elapsedSeconds = Math.floor((Date.now() - sharedTime) / 1000);
    const remaining = LOCK_SECONDS - elapsedSeconds;
    return remaining > 0 ? remaining : 0;
  }

  /** Loop de atualização em tempo real dos contadores na tela */
  function startCountdownLoop() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      const countdownButtons = document.querySelectorAll('[data-countdown-note]');
      countdownButtons.forEach(btn => {
        const noteId = btn.getAttribute('data-countdown-note');
        const note = state.notes.find(n => n.id === noteId);
        if (!note) return;

        const remaining = getRemainingLockSeconds(note);
        if (remaining > 0) {
          btn.disabled = true;
          btn.textContent = `⏳ Aguarde ${remaining}s para confirmar`;
        } else {
          btn.disabled = false;
          btn.removeAttribute('data-countdown-note');
          btn.className = 'btn btn-confirm btn-sm';
          btn.textContent = '✅ Confirmar Leitura';
        }
      });
    }, 1000);
  }

  // ==========================================================================
  // INTEGRAÇÃO COM WHATSAPP E GERAÇÃO DA MENSAGEM
  // ==========================================================================

  function buildConfirmationLink(noteId) {
    const baseUrl = window.location.origin !== 'null'
      ? `${window.location.origin}${window.location.pathname}`
      : window.location.href.split('?')[0];
    return `${baseUrl}?confirmar=${encodeURIComponent(noteId)}`;
  }

  function formatWhatsAppMessage(note, shareId) {
    const cat = state.categories.find(c => c.id === note.categoryId);
    const catName = cat ? cat.name : 'Geral';
    const dataRef = note.dueDate
      ? `${formatDateBR(note.createdAt)} (Ref: ${formatDateBR(note.dueDate)})`
      : formatDateBR(note.createdAt);
    const confirmLink = buildConfirmationLink(note.id);

    return (
`━━━━━━━━━━━━━━━━━━
📌 *COMUNICADO / ANOTAÇÃO*
🆔 *ID:* ${shareId}
📝 *Título:* ${note.title}
📂 *Categoria:* ${catName}
📅 *Data:* ${dataRef}
💻 *Sistema/Setor:* ${note.system}
━━━━━━━━━━━━━━━━━━
📄 *DESCRIÇÃO:*
${note.content}
━━━━━━━━━━━━━━━━━━
🔔 *CONFIRMAÇÃO DE LEITURA*
Solicitamos que confirme o recebimento e a leitura deste comunicado.
🔗 *Confirmar leitura:*
${confirmLink}
━━━━━━━━━━━━━━━━━━
_Mensagem gerada pelo sistema de anotações._`
    );
  }

  function buildWhatsAppURL(phone, messageText) {
    const encodedText = encodeURIComponent(messageText);
    const cleanPhone = (phone || '').replace(/\D/g, '');

    if (cleanPhone.length >= 10) {
      return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
    }
    return `https://api.whatsapp.com/send?text=${encodedText}`;
  }

  /** Executa o fluxo de compartilhamento e inicia o bloqueio de 60s */
  function shareNoteViaWhatsApp(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;

    const nowISO = new Date().toISOString();
    const shareId = note.shareId || generateUID('ENV');
    const messageText = formatWhatsAppMessage(note, shareId);
    const waUrl = buildWhatsAppURL(note.phone, messageText);

    // Atualiza estado da anotação
    note.shareId = shareId;
    note.sharedAt = nowISO;
    if (note.status !== 'Lido') {
      note.status = 'Aguardando confirmação';
    }

    // Registra no histórico de compartilhamentos
    state.history.unshift({
      historyId: generateUID('HIST'),
      noteId: note.id,
      shareId: shareId,
      noteTitle: note.title,
      system: note.system,
      recipient: note.recipient,
      phone: note.phone || 'Grupo / Seleção manual',
      messageSent: messageText,
      sharedAt: nowISO,
      status: note.status,
      confirmedAt: note.confirmedAt || null
    });

    persistAll();
    renderAll();

    // Abre WhatsApp em nova aba / aplicativo
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    showToast('WhatsApp aberto! Temporizador de 60s iniciado para confirmação.', 'success');
  }

  // ==========================================================================
  // CONFIRMAÇÃO DE LEITURA (VALIDAÇÃO ESTRITA)
  // ==========================================================================

  function confirmNoteReading(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) {
      showToast('Comunicado não encontrado neste navegador.', 'error');
      return false;
    }

    if (!note.sharedAt) {
      showToast('Este comunicado ainda não foi compartilhado.', 'warning');
      return false;
    }

    // Validação JavaScript real contra burla visual no DOM
    const remaining = getRemainingLockSeconds(note);
    if (remaining > 0) {
      showToast(`Ação bloqueada! Aguarde mais ${remaining} segundos para confirmar.`, 'error');
      return false;
    }

    if (note.status === 'Lido') {
      showToast('Esta leitura já foi confirmada anteriormente.', 'info');
      return true;
    }

    const confirmedISO = new Date().toISOString();
    note.status = 'Lido';
    note.confirmedAt = confirmedISO;

    // Atualiza registros correspondentes no histórico
    state.history.forEach(item => {
      if (item.noteId === note.id && !item.confirmedAt) {
        item.status = 'Lido';
        item.confirmedAt = confirmedISO;
      }
    });

    persistAll();
    renderAll();
    showToast('Leitura confirmada e registrada com sucesso!', 'success');
    return true;
  }

  /** Renderiza a tela dedicada quando acessada pelo link ?confirmar=ID */
  function openConfirmationScreen(noteId) {
    switchView('confirmacao');
    const note = state.notes.find(n => n.id === noteId);
    const titleEl = document.getElementById('confTitle');
    const metaEl = document.getElementById('confMeta');
    const contentEl = document.getElementById('confContent');
    const actionArea = document.getElementById('confActionArea');

    if (!note) {
      titleEl.textContent = 'Comunicado não localizado localmente';
      metaEl.innerHTML = '<span>⚠️ Registro inexistente neste navegador.</span>';
      contentEl.textContent =
        'Este link aponta para um comunicado armazenado no LocalStorage do dispositivo de origem ou o cache foi limpo.';
      actionArea.innerHTML = '';
      return;
    }

    const cat = state.categories.find(c => c.id === note.categoryId);
    titleEl.textContent = note.title;
    metaEl.innerHTML = `
      <span><strong>🆔 ID:</strong> ${escapeHTML(note.shareId || note.id)}</span>
      <span><strong>📂 Categoria:</strong> ${escapeHTML(cat ? cat.name : 'Geral')}</span>
      <span><strong>💻 Setor:</strong> ${escapeHTML(note.system)}</span>
      <span><strong>👤 Destinatário:</strong> ${escapeHTML(note.recipient)}</span>
    `;
    contentEl.textContent = note.content;

    const renderConfButton = () => {
      if (note.status === 'Lido') {
        actionArea.innerHTML = `
          <div class="badge status-lido" style="font-size: 0.95rem; padding: 0.6rem 1.2rem;">
            ✅ LEITURA CONFIRMADA EM ${formatDateTime(note.confirmedAt)}
          </div>
        `;
        return;
      }

      const remaining = getRemainingLockSeconds(note);
      if (remaining > 0) {
        actionArea.innerHTML = `
          <button id="btnScreenConfirm" class="btn btn-outline" disabled>
            ⏳ Botão bloqueado — aguarde ${remaining}s
          </button>
        `;
      } else {
        actionArea.innerHTML = `
          <button id="btnScreenConfirm" class="btn btn-confirm">
            ✅ CONFIRMAR LEITURA AGORA
          </button>
        `;
        document.getElementById('btnScreenConfirm').addEventListener('click', () => {
          if (confirmNoteReading(note.id)) {
            renderConfButton();
          }
        });
      }
    };

    renderConfButton();
    const screenTimer = setInterval(() => {
      if (document.getElementById('view-confirmacao').classList.contains('hidden')) {
        clearInterval(screenTimer);
        return;
      }
      renderConfButton();
      if (note.status === 'Lido') clearInterval(screenTimer);
    }, 1000);
  }

  // ==========================================================================
  // RENDERIZAÇÃO DO DASHBOARD E CARDS
  // ==========================================================================

  function renderAll() {
    renderKPIs();
    renderNotesGrid();
  }

  function renderKPIs() {
    const total = state.notes.length;
    const shared = state.notes.filter(n => Boolean(n.sharedAt)).length;
    const read = state.notes.filter(n => n.status === 'Lido').length;
    const pending = state.notes.filter(
      n => n.status === 'Aguardando confirmação' || n.status === 'Compartilhado' || n.status === 'Atrasado'
    ).length;

    const urgentCat = state.categories.find(c => c.name.toLowerCase() === 'urgente');
    const urgent = state.notes.filter(n => urgentCat && n.categoryId === urgentCat.id).length;

    document.getElementById('kpiTotal').textContent = total;
    document.getElementById('kpiShared').textContent = shared;
    document.getElementById('kpiRead').textContent = read;
    document.getElementById('kpiPending').textContent = pending;
    document.getElementById('kpiUrgent').textContent = urgent;
  }

  function getFilteredNotes() {
    const search = document.getElementById('filterSearch').value.trim().toLowerCase();
    const category = document.getElementById('filterCategory').value;
    const status = document.getElementById('filterStatus').value;
    const system = document.getElementById('filterSystem').value.trim().toLowerCase();
    const recipient = document.getElementById('filterRecipient').value.trim().toLowerCase();
    const date = document.getElementById('filterDate').value;

    return state.notes.filter(note => {
      if (search) {
        const matchText =
          note.title.toLowerCase().includes(search) ||
          note.content.toLowerCase().includes(search) ||
          (note.shareId && note.shareId.toLowerCase().includes(search));
        if (!matchText) return false;
      }
      if (category && note.categoryId !== category) return false;
      if (status && note.status !== status) return false;
      if (system && !note.system.toLowerCase().includes(system)) return false;
      if (recipient && !note.recipient.toLowerCase().includes(recipient)) return false;
      if (date) {
        const createdDay = note.createdAt.split('T')[0];
        if (createdDay !== date && note.dueDate !== date) return false;
      }
      return true;
    });
  }

  function getStatusBadgeClass(status) {
    const map = {
      'Rascunho': 'status-rascunho',
      'Aguardando envio': 'status-aguardando-envio',
      'Compartilhado': 'status-compartilhado',
      'Aguardando confirmação': 'status-aguardando-confirmacao',
      'Lido': 'status-lido',
      'Atrasado': 'status-atrasado'
    };
    return map[status] || 'status-rascunho';
  }

  function renderNotesGrid() {
    const grid = document.getElementById('notesGrid');
    const filtered = getFilteredNotes();

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3>Nenhuma anotação encontrada</h3>
          <p>Crie um novo comunicado ou ajuste os filtros de busca acima.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered
      .map(note => {
        const cat = state.categories.find(c => c.id === note.categoryId) || {
          name: 'Geral',
          color: '#2563eb'
        };
        const statusClass = getStatusBadgeClass(note.status);
        const remaining = note.sharedAt ? getRemainingLockSeconds(note) : 0;
        const canShowConfirmBtn = Boolean(note.sharedAt) && note.status !== 'Lido';

        let confirmButtonHTML = '';
        if (canShowConfirmBtn) {
          if (remaining > 0) {
            confirmButtonHTML = `
              <button class="btn btn-outline btn-sm" disabled data-countdown-note="${escapeHTML(note.id)}">
                ⏳ Aguarde ${remaining}s para confirmar
              </button>
            `;
          } else {
            confirmButtonHTML = `
              <button class="btn btn-confirm btn-sm" data-action="confirm" data-id="${escapeHTML(note.id)}">
                ✅ Confirmar Leitura
              </button>
            `;
          }
        }

        let trackingText = 'Ainda não compartilhado via WhatsApp.';
        if (note.status === 'Lido') {
          trackingText = `✅ Lido em: <strong>${formatDateTime(note.confirmedAt)}</strong> (ID: ${escapeHTML(note.shareId)})`;
        } else if (note.sharedAt) {
          trackingText = `📤 Enviado em: ${formatDateTime(note.sharedAt)} (ID: ${escapeHTML(note.shareId)})`;
        }

        return `
          <article class="note-card" style="border-top-color: ${escapeHTML(cat.color)}">
            <div>
              <div class="note-card-header">
                <span class="badge" style="background: ${escapeHTML(cat.color)}20; color: ${escapeHTML(cat.color)}">
                  ● ${escapeHTML(cat.name)}
                </span>
                <span class="badge ${statusClass}">${escapeHTML(note.status)}</span>
              </div>

              <h3 class="note-title">${escapeHTML(note.title)}</h3>

              <div class="note-meta">
                <span>💻 ${escapeHTML(note.system)}</span>
                <span>👤 ${escapeHTML(note.recipient)}</span>
                <span>📅 ${formatDateBR(note.createdAt)}</span>
                ${note.dueDate ? `<span>⏰ Venc: ${formatDateBR(note.dueDate)}</span>` : ''}
              </div>

              <div class="note-excerpt">${escapeHTML(note.content)}</div>
            </div>

            <div>
              <div class="note-tracking-info">${trackingText}</div>

              <div class="note-card-actions">
                <div class="primary-actions ${canShowConfirmBtn ? 'has-confirm' : ''}">
                  <button class="btn btn-whatsapp btn-sm" data-action="whatsapp" data-id="${escapeHTML(note.id)}">
                    📲 Enviar pelo WhatsApp
                  </button>
                  ${confirmButtonHTML}
                </div>

                <div class="secondary-actions">
                  <button class="btn btn-outline" data-action="view" data-id="${escapeHTML(note.id)}" title="Visualizar">👁️ Ver</button>
                  <button class="btn btn-outline" data-action="edit" data-id="${escapeHTML(note.id)}" title="Editar">✏️ Editar</button>
                  <button class="btn btn-outline" data-action="history" data-id="${escapeHTML(note.id)}" title="Histórico">🕒 Hist.</button>
                  <button class="btn btn-outline" data-action="delete" data-id="${escapeHTML(note.id)}" title="Excluir">🗑️</button>
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  // ==========================================================================
  // CRUD DE ANOTAÇÕES
  // ==========================================================================

  function openNewNoteForm(noteToEdit = null) {
    const form = document.getElementById('noteForm');
    form.reset();

    if (noteToEdit) {
      document.getElementById('formTitle').textContent = 'Editar Anotação / Comunicado';
      document.getElementById('noteId').value = noteToEdit.id;
      document.getElementById('noteTitle').value = noteToEdit.title;
      document.getElementById('noteCategory').value = noteToEdit.categoryId;
      document.getElementById('noteCreatedAt').value = formatDateTime(noteToEdit.createdAt);
      document.getElementById('noteDueDate').value = noteToEdit.dueDate || '';
      document.getElementById('noteSystem').value = noteToEdit.system;
      document.getElementById('noteRecipient').value = noteToEdit.recipient;
      document.getElementById('notePhone').value = noteToEdit.phone || '';
      document.getElementById('noteContent').value = noteToEdit.content;
      document.getElementById('noteObs').value = noteToEdit.obs || '';
      document.getElementById('noteInitialStatus').value =
        noteToEdit.status === 'Rascunho' ? 'Rascunho' : 'Aguardando envio';
    } else {
      document.getElementById('formTitle').textContent = 'Cadastrar Nova Anotação / Comunicado';
      document.getElementById('noteId').value = '';
      document.getElementById('noteCreatedAt').value = formatDateTime(new Date().toISOString());
    }

    switchView('nova-anotacao');
  }

  function handleSaveNote(e) {
    e.preventDefault();

    const id = document.getElementById('noteId').value;
    const title = document.getElementById('noteTitle').value.trim();
    const categoryId = document.getElementById('noteCategory').value;
    const dueDate = document.getElementById('noteDueDate').value;
    const system = document.getElementById('noteSystem').value.trim();
    const recipient = document.getElementById('noteRecipient').value.trim();
    const phone = document.getElementById('notePhone').value.replace(/\D/g, '');
    const content = document.getElementById('noteContent').value.trim();
    const obs = document.getElementById('noteObs').value.trim();
    const initialStatus = document.getElementById('noteInitialStatus').value;

    if (!title || !categoryId || !system || !recipient || !content) {
      showToast('Preencha todos os campos obrigatórios (*).', 'error');
      return;
    }

    if (id) {
      const existing = state.notes.find(n => n.id === id);
      if (existing) {
        existing.title = title;
        existing.categoryId = categoryId;
        existing.dueDate = dueDate;
        existing.system = system;
        existing.recipient = recipient;
        existing.phone = phone;
        existing.content = content;
        existing.obs = obs;
        if (!existing.sharedAt) {
          existing.status = initialStatus;
        }
        showToast('Anotação atualizada com sucesso!', 'success');
      }
    } else {
      // Previne duplicidade acidental por clique duplo
      const isDuplicate = state.notes.some(
        n => n.title.toLowerCase() === title.toLowerCase() && n.content === content
      );
      if (isDuplicate) {
        showToast('Já existe uma anotação idêntica cadastrada.', 'warning');
        return;
      }

      const newNote = {
        id: generateUID('NOTE'),
        title,
        content,
        createdAt: new Date().toISOString(),
        dueDate,
        categoryId,
        system,
        recipient,
        phone,
        obs,
        status: initialStatus,
        shareId: null,
        sharedAt: null,
        confirmedAt: null
      };

      state.notes.unshift(newNote);
      showToast('Nova anotação cadastrada!', 'success');
    }

    evaluateOverdueNotes();
    persistAll();
    switchView('dashboard');
  }

  function deleteNote(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;

    openModal(
      'Confirmar Exclusão',
      `<p>Tem certeza que deseja excluir permanentemente a anotação <strong>"${escapeHTML(note.title)}"</strong>?</p>`,
      [
        { label: 'Cancelar', class: 'btn btn-outline', onClick: closeModal },
        {
          label: 'Excluir Definitivamente',
          class: 'btn btn-danger',
          onClick: () => {
            state.notes = state.notes.filter(n => n.id !== noteId);
            persistAll();
            renderAll();
            closeModal();
            showToast('Anotação excluída.', 'info');
          }
        }
      ]
    );
  }

  // ==========================================================================
  // MODAIS DE VISUALIZAÇÃO E HISTÓRICO INDIVIDUAL
  // ==========================================================================

  function openViewNoteModal(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;

    const cat = state.categories.find(c => c.id === note.categoryId);
    const previewMsg = formatWhatsAppMessage(note, note.shareId || 'PREVIEW-ID');

    const bodyHTML = `
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        <div><strong>Título:</strong> ${escapeHTML(note.title)}</div>
        <div><strong>Categoria:</strong> ${escapeHTML(cat ? cat.name : 'Geral')} | <strong>Status:</strong> ${escapeHTML(note.status)}</div>
        <div><strong>Sistema/Setor:</strong> ${escapeHTML(note.system)}</div>
        <div><strong>Destinatário:</strong> ${escapeHTML(note.recipient)} ${note.phone ? `(${escapeHTML(note.phone)})` : ''}</div>
        <div><strong>Criado em:</strong> ${formatDateTime(note.createdAt)} ${note.dueDate ? `| <strong>Vencimento:</strong> ${formatDateBR(note.dueDate)}` : ''}</div>
        ${note.obs ? `<div><strong>Obs. Interna:</strong> ${escapeHTML(note.obs)}</div>` : ''}
        <div>
          <strong>Prévia da Mensagem WhatsApp:</strong>
          <div class="preview-box">${escapeHTML(previewMsg)}</div>
        </div>
      </div>
    `;

    openModal('Detalhes do Comunicado', bodyHTML, [
      { label: 'Fechar', class: 'btn btn-outline', onClick: closeModal },
      {
        label: '📲 Enviar pelo WhatsApp',
        class: 'btn btn-whatsapp',
        onClick: () => {
          closeModal();
          shareNoteViaWhatsApp(note.id);
        }
      }
    ]);
  }

  function openNoteHistoryModal(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    const logs = state.history.filter(h => h.noteId === noteId);

    let bodyHTML = `<p><strong>Comunicado:</strong> ${escapeHTML(note ? note.title : noteId)}</p><hr style="margin:0.75rem 0; border-color:#e2e8f0;">`;

    if (logs.length === 0) {
      bodyHTML += '<p class="text-muted">Nenhum compartilhamento registrado para esta anotação até o momento.</p>';
    } else {
      bodyHTML += logs
        .map(
          log => `
          <div style="padding:0.75rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:0.65rem;">
            <div><strong>ID Envio:</strong> ${escapeHTML(log.shareId)}</div>
            <div><strong>Enviado em:</strong> ${formatDateTime(log.sharedAt)}</div>
            <div><strong>Destinatário:</strong> ${escapeHTML(log.recipient)}</div>
            <div><strong>Status:</strong> ${escapeHTML(log.status)}</div>
            <div><strong>Confirmação:</strong> ${log.confirmedAt ? formatDateTime(log.confirmedAt) : 'Pendente'}</div>
          </div>
        `
        )
        .join('');
    }

    openModal('Histórico Individual de Envios', bodyHTML, [
      { label: 'Fechar', class: 'btn btn-outline', onClick: closeModal }
    ]);
  }

  function openModal(title, bodyHTML, buttons = []) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHTML;

    const footer = document.getElementById('modalFooter');
    footer.innerHTML = '';
    buttons.forEach(btnCfg => {
      const btn = document.createElement('button');
      btn.className = btnCfg.class;
      btn.textContent = btnCfg.label;
      btn.addEventListener('click', btnCfg.onClick);
      footer.appendChild(btn);
    });

    document.getElementById('appModal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('appModal').classList.add('hidden');
  }

  // ==========================================================================
  // HISTÓRICO GERAL, CATEGORIAS E DESTINATÁRIOS
  // ==========================================================================

  function renderHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    if (state.history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem;">Nenhum envio registrado ainda.</td></tr>';
      return;
    }

    tbody.innerHTML = state.history
      .map(
        item => `
        <tr>
          <td>${formatDateTime(item.sharedAt)}</td>
          <td><code>${escapeHTML(item.shareId)}</code></td>
          <td><strong>${escapeHTML(item.noteTitle)}</strong><br><small>${escapeHTML(item.system)}</small></td>
          <td>${escapeHTML(item.recipient)}</td>
          <td><span class="badge ${getStatusBadgeClass(item.status)}">${escapeHTML(item.status)}</span></td>
          <td>${item.confirmedAt ? formatDateTime(item.confirmedAt) : '<em>Aguardando</em>'}</td>
          <td>
            <button class="btn btn-outline btn-sm" data-view-hist-msg="${escapeHTML(item.historyId)}">Ver Texto</button>
          </td>
        </tr>
      `
      )
      .join('');
  }

  function populateCategorySelects() {
    const noteCatSelect = document.getElementById('noteCategory');
    const filterCatSelect = document.getElementById('filterCategory');

    const optionsHTML = state.categories
      .map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`)
      .join('');

    noteCatSelect.innerHTML = optionsHTML;
    filterCatSelect.innerHTML = `<option value="">Todas as Categorias</option>${optionsHTML}`;
  }

  function populateRecipientSelect() {
    const sel = document.getElementById('noteRecipientSelect');
    sel.innerHTML =
      '<option value="">-- Selecionar destinatário cadastrado --</option>' +
      state.recipients
        .map(r => `<option value="${escapeHTML(r.id)}">${escapeHTML(r.name)} ${r.phone ? `(${escapeHTML(r.phone)})` : ''}</option>`)
        .join('');
  }

  function renderManageLists() {
    const catList = document.getElementById('categoriesList');
    catList.innerHTML = state.categories
      .map(
        c => `
        <li>
          <span>
            <strong style="color:${escapeHTML(c.color)}">●</strong> ${escapeHTML(c.name)}
          </span>
          <button class="btn btn-outline btn-sm" data-del-cat="${escapeHTML(c.id)}">Remover</button>
        </li>
      `
      )
      .join('');

    const recList = document.getElementById('recipientsList');
    if (state.recipients.length === 0) {
      recList.innerHTML = '<li><span class="text-muted">Nenhum destinatário salvo.</span></li>';
    } else {
      recList.innerHTML = state.recipients
        .map(
          r => `
          <li>
            <span><strong>${escapeHTML(r.name)}</strong> ${r.phone ? `- ${escapeHTML(r.phone)}` : '(Grupo)'}</span>
            <button class="btn btn-outline btn-sm" data-del-rec="${escapeHTML(r.id)}">Remover</button>
          </li>
        `
        )
        .join('');
    }
  }

  // ==========================================================================
  // EXPORTAÇÃO E IMPORTAÇÃO JSON (BACKUP)
  // ==========================================================================

  function exportJSON() {
    const payload = {
      app: 'ComunicaNotes',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data: {
        notes: state.notes,
        categories: state.categories,
        recipients: state.recipients,
        history: state.history
      }
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `backup-comunicanotes-${dateStamp}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Backup JSON exportado com sucesso!', 'success');
  }

  function importJSON() {
    const fileInput = document.getElementById('importJsonFile');
    const file = fileInput.files[0];
    if (!file) {
      showToast('Selecione um arquivo .json primeiro.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const parsed = JSON.parse(event.target.result);
        const importedData = parsed.data || parsed;

        if (!Array.isArray(importedData.notes)) {
          throw new Error('Estrutura de arquivo inválida.');
        }

        state.notes = importedData.notes;
        if (Array.isArray(importedData.categories) && importedData.categories.length > 0) {
          state.categories = importedData.categories;
        }
        if (Array.isArray(importedData.recipients)) {
          state.recipients = importedData.recipients;
        }
        if (Array.isArray(importedData.history)) {
          state.history = importedData.history;
        }

        persistAll();
        populateCategorySelects();
        populateRecipientSelect();
        renderAll();
        fileInput.value = '';
        showToast('Backup restaurado com sucesso!', 'success');
        switchView('dashboard');
      } catch (err) {
        console.error(err);
        showToast('Falha ao importar: arquivo JSON inválido ou corrompido.', 'error');
      }
    };
    reader.readAsText(file);
  }

  // ==========================================================================
  // EVENT LISTENERS
  // ==========================================================================

  function bindEvents() {
    // Navegação Sidebar
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        if (view === 'nova-anotacao') {
          openNewNoteForm();
        } else {
          switchView(view);
        }
      });
    });

    document.getElementById('btnQuickNew').addEventListener('click', () => openNewNoteForm());
    document.getElementById('btnCancelForm').addEventListener('click', () => switchView('dashboard'));
    document.getElementById('btnBackToPanel').addEventListener('click', () => switchView('dashboard'));

    // Menu Mobile
    document.getElementById('openSidebarBtn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.add('open');
      document.getElementById('sidebarOverlay').classList.add('open');
    });
    document.getElementById('closeSidebarBtn').addEventListener('click', closeMobileSidebar);
    document.getElementById('sidebarOverlay').addEventListener('click', closeMobileSidebar);

    // Formulário de Anotação
    document.getElementById('noteForm').addEventListener('submit', handleSaveNote);

    // Preenchimento automático ao escolher destinatário salvo
    document.getElementById('noteRecipientSelect').addEventListener('change', e => {
      const rec = state.recipients.find(r => r.id === e.target.value);
      if (rec) {
        document.getElementById('noteRecipient').value = rec.name;
        document.getElementById('notePhone').value = rec.phone || '';
      }
    });

    // Filtros em tempo real
    ['filterSearch', 'filterCategory', 'filterStatus', 'filterSystem', 'filterRecipient', 'filterDate'].forEach(
      id => {
        document.getElementById(id).addEventListener('input', renderNotesGrid);
      }
    );

    document.getElementById('btnClearFilters').addEventListener('click', () => {
      document.getElementById('filterSearch').value = '';
      document.getElementById('filterCategory').value = '';
      document.getElementById('filterStatus').value = '';
      document.getElementById('filterSystem').value = '';
      document.getElementById('filterRecipient').value = '';
      document.getElementById('filterDate').value = '';
      renderNotesGrid();
    });

    // Delegação de eventos nos Cards de Anotações
    document.getElementById('notesGrid').addEventListener('click', e => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');

      if (action === 'whatsapp') shareNoteViaWhatsApp(id);
      if (action === 'confirm') confirmNoteReading(id);
      if (action === 'view') openViewNoteModal(id);
      if (action === 'edit') {
        const note = state.notes.find(n => n.id === id);
        if (note) openNewNoteForm(note);
      }
      if (action === 'history') openNoteHistoryModal(id);
      if (action === 'delete') deleteNote(id);
    });

    // Histórico Geral -> Ver texto enviado
    document.getElementById('historyTableBody').addEventListener('click', e => {
      const btn = e.target.closest('button[data-view-hist-msg]');
      if (!btn) return;
      const histId = btn.getAttribute('data-view-hist-msg');
      const log = state.history.find(h => h.historyId === histId);
      if (!log) return;

      openModal(
        `Mensagem Enviada (${escapeHTML(log.shareId)})`,
        `<div class="preview-box">${escapeHTML(log.messageSent)}</div>`,
        [{ label: 'Fechar', class: 'btn btn-outline', onClick: closeModal }]
      );
    });

    // Cadastro de Categorias
    document.getElementById('categoryForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('catName').value.trim();
      const color = document.getElementById('catColor').value;
      if (!name) return;

      if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        showToast('Essa categoria já existe.', 'warning');
        return;
      }

      state.categories.push({ id: generateUID('CAT'), name, color });
      persistAll();
      populateCategorySelects();
      renderManageLists();
      e.target.reset();
      showToast('Categoria adicionada!', 'success');
    });

    document.getElementById('categoriesList').addEventListener('click', e => {
      const btn = e.target.closest('button[data-del-cat]');
      if (!btn) return;
      if (state.categories.length <= 1) {
        showToast('Mantenha pelo menos uma categoria cadastrada.', 'warning');
        return;
      }
      const catId = btn.getAttribute('data-del-cat');
      state.categories = state.categories.filter(c => c.id !== catId);
      persistAll();
      populateCategorySelects();
      renderManageLists();
      showToast('Categoria removida.', 'info');
    });

    // Cadastro de Destinatários
    document.getElementById('recipientForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('recName').value.trim();
      const phone = document.getElementById('recPhone').value.replace(/\D/g, '');
      if (!name) return;

      state.recipients.push({ id: generateUID('REC'), name, phone });
      persistAll();
      populateRecipientSelect();
      renderManageLists();
      e.target.reset();
      showToast('Destinatário salvo!', 'success');
    });

    document.getElementById('recipientsList').addEventListener('click', e => {
      const btn = e.target.closest('button[data-del-rec]');
      if (!btn) return;
      const recId = btn.getAttribute('data-del-rec');
      state.recipients = state.recipients.filter(r => r.id !== recId);
      persistAll();
      populateRecipientSelect();
      renderManageLists();
      showToast('Destinatário removido.', 'info');
    });

    // Backup JSON e Reset
    document.getElementById('btnExportJson').addEventListener('click', exportJSON);
    document.getElementById('btnImportJson').addEventListener('click', importJSON);
    document.getElementById('btnLoadDemo').addEventListener('click', () => seedDemoData(true));
    document.getElementById('btnResetAll').addEventListener('click', () => {
      openModal(
        'Zerar Todos os Dados',
        '<p>Isso apagará todas as anotações, históricos e destinatários salvos no LocalStorage deste navegador. Deseja continuar?</p>',
        [
          { label: 'Cancelar', class: 'btn btn-outline', onClick: closeModal },
          {
            label: 'Sim, apagar tudo',
            class: 'btn btn-danger',
            onClick: () => {
              state.notes = [];
              state.recipients = [];
              state.history = [];
              state.categories = [...DEFAULT_CATEGORIES];
              persistAll();
              populateCategorySelects();
              populateRecipientSelect();
              renderAll();
              closeModal();
              showToast('Todos os dados foram apagados.', 'info');
            }
          }
        ]
      );
    });

    // Modal close
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('modalBackdrop').addEventListener('click', closeModal);
  }

  // Inicializa quando o DOM estiver pronto
  document.addEventListener('DOMContentLoaded', initApp);
})();
