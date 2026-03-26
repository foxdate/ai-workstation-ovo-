
    (function () {
      var CONVERSATIONS_KEY = 'recallweb_conversations';
      var CURRENT_TAB_KEY = 'recallweb_current_tab';
      var defaultBase = window.location.origin + '/api/v1';
      var apis = [];
      var plugins = [];
      var currentAttachments = [];

      /** 产品显示名称：修改此处即可全局换名（勿改 ZhiQuanExt、zhiquan_workspace、ZHIQUAN_TERMS 等技术标识） */
      var APP_NAME = 'OVO';

      // 仅显示当前 API 返回的可用模型，不展示无法连接的模型
      var modelList = [];

      var conversations = [];
      var currentTabId = null;
      var tabIdCounter = 1;
      var lastBrowserCapture = null;
      var MAIN_VIEW_KEY = 'zq_main_view';
      var mainView = 'chat';
      try { mainView = localStorage.getItem(MAIN_VIEW_KEY) || 'chat'; } catch (e) {}
      var WF_STATE_KEY = 'zq_workflow_state';
      var wfState = { prompt: '', negative: '', promptPrefix: '', promptSuffix: '', comfyLoraName: '', comfyLoraStrengthModel: 0.8, comfyLoraStrengthClip: 0.8, comfyControlLoadImageNodeId: '', comfyStyleRefLoadImageNodeId: '', useRefStyleComfy: true, recommendedPrompt: '', promptTerms: [], selectedTerms: {}, styleTokenCounts: {}, stylePresets: [], refImages: [], batchSize: 8, size: '512x512', imageModel: 'dall-e-3', saveSubdir: 'pixel', images: [], selected: -1, collabModel: '', collabMessages: [], workflowSessions: [], currentWorkflowSessionId: null, saved: [], refIndex: -1, genBackend: 'comfyui', comfyuiBase: 'http://127.0.0.1:8188', hideImageGenBackendUi: false, favoritePrompts: [] };
      try {
        var wfRaw = localStorage.getItem(WF_STATE_KEY);
        if (wfRaw) {
          var parsed = JSON.parse(wfRaw);
          if (parsed && typeof parsed === 'object') wfState = Object.assign(wfState, parsed);
        }
      } catch (e) {}
      try {
        migrateAndSyncWorkflowSessions();
      } catch (e) {
        try { console.warn(APP_NAME + ': 工作流状态已重置', e); } catch (e2) {}
        wfState.workflowSessions = [];
        wfState.currentWorkflowSessionId = null;
        if (!Array.isArray(wfState.collabMessages)) wfState.collabMessages = [];
      }

      function loadState() {
        try {
          var raw = localStorage.getItem(CONVERSATIONS_KEY);
          if (raw) {
            var parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length) {
              conversations = parsed;
              tabIdCounter = Math.max(tabIdCounter, Math.max.apply(null, conversations.map(function (c) { return c.id; })) + 1);
            }
          }
        } catch (e) {}
        currentTabId = localStorage.getItem(CURRENT_TAB_KEY);
        if (!conversations.length) {
          conversations = [{ id: tabIdCounter++, model: (modelList[0] && modelList[0].id) || '', messages: [] }];
          currentTabId = String(conversations[0].id);
        }
        if (!currentTabId || !conversations.find(function (c) { return String(c.id) === currentTabId; })) {
          currentTabId = String(conversations[0].id);
        }
      }

      function saveState() {
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
        if (currentTabId) localStorage.setItem(CURRENT_TAB_KEY, currentTabId);
        try { localStorage.setItem(MAIN_VIEW_KEY, mainView || 'chat'); } catch (e) {}
        try {
          fetch(window.location.origin + '/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversations: conversations, currentTabId: currentTabId })
          }).catch(function () {});
        } catch (e) {}
      }

      function saveWorkflowState() {
        if (Array.isArray(wfState.workflowSessions) && wfState.currentWorkflowSessionId) {
          for (var wi = 0; wi < wfState.workflowSessions.length; wi++) {
            if (wfState.workflowSessions[wi].id === wfState.currentWorkflowSessionId) {
              wfState.workflowSessions[wi].collabMessages = Array.isArray(wfState.collabMessages) ? wfState.collabMessages : [];
              wfState.workflowSessions[wi].collabModel = wfState.collabModel || '';
              break;
            }
          }
        }
        try {
          localStorage.setItem(WF_STATE_KEY, JSON.stringify(wfState));
        } catch (e) {
          if (wfState.favoritePrompts && wfState.favoritePrompts.length) {
            while (wfState.favoritePrompts.length > 0) {
              wfState.favoritePrompts.pop();
              try {
                localStorage.setItem(WF_STATE_KEY, JSON.stringify(wfState));
                try { if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('存储空间不足，已移除部分「满意方案」'); } catch (e2) {}
                renderWorkflowFavorites();
                return;
              } catch (e2) {}
            }
          }
          if (wfState.refImages && wfState.refImages.length > 1) {
            wfState.refImages = wfState.refImages.slice(0, 1);
            try { localStorage.setItem(WF_STATE_KEY, JSON.stringify(wfState)); } catch (e2) {}
            try { if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('存储空间不足，已只保留一张参考图'); } catch (e3) {}
          } else if (wfState.refImages && wfState.refImages.length) {
            wfState.refImages = [];
            try { localStorage.setItem(WF_STATE_KEY, JSON.stringify(wfState)); } catch (e4) {}
            try { if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('参考图过大，已清除，请压缩后重传'); } catch (e5) {}
          }
        }
      }

      /** 随会话持久化：告知协同 AI 必须使用 <<<ZHIQUAN_TERMS>>> 块（内部消息，界面不展示） */
      var WORKFLOW_INTERNAL_FORMAT_RULES = '【' + APP_NAME + '软件 · 会话约定】当用户点击「提炼关键词」或需要你输出可拼接到图像提示词的词条时，你必须使用以下机器可读格式（标记名必须一字不差）：\n<<<ZHIQUAN_TERMS>>>\n（每行一个或多个短语；同一行可用英文逗号或中文逗号分隔；不要用 1.2. 编号）\n<<<END_ZHIQUAN_TERMS>>>\n在此之前或之后可写给人看的说明。不使用该块则用户端无法可靠解析词条。普通闲聊无需强制使用该块。';

      function migrateAndSyncWorkflowSessions() {
        if (!Array.isArray(wfState.workflowSessions)) wfState.workflowSessions = [];
        if (!Array.isArray(wfState.collabMessages)) wfState.collabMessages = [];
        if (wfState.promptTerms && !Array.isArray(wfState.promptTerms)) wfState.promptTerms = [];
        if (wfState.selectedTerms && typeof wfState.selectedTerms !== 'object') wfState.selectedTerms = {};
        if (!wfState.styleTokenCounts || typeof wfState.styleTokenCounts !== 'object') wfState.styleTokenCounts = {};
        if (!Array.isArray(wfState.stylePresets)) wfState.stylePresets = [];
        if (!Array.isArray(wfState.refImages)) wfState.refImages = [];
        if (typeof wfState.hideImageGenBackendUi !== 'boolean') wfState.hideImageGenBackendUi = false;
        if (!Array.isArray(wfState.favoritePrompts)) wfState.favoritePrompts = [];
        if (wfState.workflowSessions.length === 0 && wfState.collabMessages.length) {
          var wid = 'wf-legacy-' + Date.now();
          wfState.workflowSessions.push({
            id: wid,
            title: '讨论 1',
            createdAt: Date.now(),
            collabMessages: wfState.collabMessages.slice(),
            collabModel: wfState.collabModel || ''
          });
          wfState.currentWorkflowSessionId = wid;
        }
        if (wfState.workflowSessions.length && !wfState.currentWorkflowSessionId) {
          wfState.currentWorkflowSessionId = wfState.workflowSessions[0].id;
        }
        if (wfState.currentWorkflowSessionId && wfState.workflowSessions.length) {
          var found = wfState.workflowSessions.some(function (s) { return s && s.id === wfState.currentWorkflowSessionId; });
          if (!found) wfState.currentWorkflowSessionId = wfState.workflowSessions[0].id;
        }
        var s = wfState.workflowSessions.find(function (x) { return x && x.id === wfState.currentWorkflowSessionId; });
        if (s) {
          wfState.collabMessages = Array.isArray(s.collabMessages) ? s.collabMessages.slice() : [];
          if (s.collabModel) wfState.collabModel = s.collabModel;
        }
      }

      function createWorkflowSessionWithFormatPrimer() {
        saveWorkflowState();
        if (!Array.isArray(wfState.workflowSessions)) wfState.workflowSessions = [];
        var n = wfState.workflowSessions.length + 1;
        var id = 'wf-' + Date.now();
        var msgs = [
          { role: 'system', internal: true, content: WORKFLOW_INTERNAL_FORMAT_RULES, ts: Date.now() },
          { role: 'assistant', content: '〔' + APP_NAME + '〕已在本讨论中向模型发送**词条输出格式**说明。请你在提炼关键词时使用 <<<ZHIQUAN_TERMS>>> … <<<END_ZHIQUAN_TERMS>>> 包裹词条，以便软件解析到右侧词条栏。', sessionNotice: true, ts: Date.now() }
        ];
        wfState.workflowSessions.push({
          id: id,
          title: '讨论 ' + n,
          createdAt: Date.now(),
          collabMessages: msgs,
          collabModel: wfState.collabModel || ''
        });
        wfState.currentWorkflowSessionId = id;
        wfState.collabMessages = msgs.slice();
        saveWorkflowState();
      }

      function ensureWorkflowSessionOnEnter() {
        migrateAndSyncWorkflowSessions();
        if (!wfState.workflowSessions || !wfState.workflowSessions.length) {
          createWorkflowSessionWithFormatPrimer();
        } else if (!wfState.currentWorkflowSessionId) {
          wfState.currentWorkflowSessionId = wfState.workflowSessions[0].id;
          migrateAndSyncWorkflowSessions();
        }
      }

      function switchWorkflowSession(sessionId) {
        if (!sessionId) return;
        saveWorkflowState();
        wfState.currentWorkflowSessionId = sessionId;
        migrateAndSyncWorkflowSessions();
        var collabSel = document.getElementById('wfCollabModel');
        if (collabSel && wfState.collabModel) try { collabSel.value = wfState.collabModel; } catch (e) {}
        renderWorkflowChatMessages();
        renderWorkflowSessionSelect();
      }

      function renderWorkflowSessionSelect() {
        var sel = document.getElementById('wfSessionSelect');
        if (!sel) return;
        var list = wfState.workflowSessions || [];
        sel.innerHTML = list.map(function (s) {
          return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.title || s.id) + '</option>';
        }).join('');
        try { sel.value = wfState.currentWorkflowSessionId || (list[0] && list[0].id) || ''; } catch (e2) {}
      }

      /** 与主对话附件一致：有参考图时 user.content 为 [text, image_url, ...] */
      function wfCollabUserContentWithRefImages(inputText, defaultWhenEmptyWithRefs) {
        var refs = wfState.refImages || [];
        if (!refs.length) {
          var only = (inputText || '').trim();
          return only || null;
        }
        var fullText = (inputText || '').trim();
        if (!fullText) fullText = defaultWhenEmptyWithRefs || '请根据图片内容回答。';
        var parts = [{ type: 'text', text: fullText }];
        refs.forEach(function (ri) {
          if (ri && ri.dataUrl) parts.push({ type: 'image_url', image_url: { url: ri.dataUrl } });
        });
        return parts;
      }

      function wfCollabMessageBubbleText(m) {
        var c = m && m.content;
        if (typeof c === 'string') return (m.refTag ? '📷 ' : '') + c;
        if (Array.isArray(c)) {
          var hasImg = c.some(function (p) { return p && p.type === 'image_url'; });
          var txt = '';
          c.forEach(function (p) {
            if (p && p.type === 'text' && p.text) txt += p.text;
          });
          return (hasImg ? '📷 ' : '') + (txt || '[含参考图]');
        }
        return String(c == null ? '' : c);
      }

      function buildWorkflowCollabApiMessages(mode, options) {
        options = options || {};
        var internalSys = (wfState.collabMessages || []).filter(function (m) { return m.internal && m.role === 'system'; }).map(function (m) { return m.content; }).join('\n\n');
        var sysMerged;
        if (options.replaceSystemContent != null) {
          sysMerged = options.replaceSystemContent;
        } else {
          var sys = (mode === 'keywords')
            ? '你是游戏美术提示词助手。根据用户输入提炼可直接用于图像生成提示词的关键词/短语（中英文均可）。\n\n【必须】先用下面固定格式输出可解析词条（每行一个短语；同一行可用英文逗号或中文逗号分隔多个短词），然后再写简短说明（可选）：\n<<<ZHIQUAN_TERMS>>>\npixel art\nside view, 2D sprite\n角色行走循环\n<<<END_ZHIQUAN_TERMS>>>\n\n格式要求：<<< 与 END 标记必须完全一致；词条区内不要写「1.」编号；重点覆盖：风格、视角、主题、材质/光照、色板、画面约束。'
            : '你是独立游戏像素美术助手。请围绕用户需求给出可操作建议：风格关键词、构图/视角、像素规范、以及如何把需求写成更稳定的提示词。回复尽量简洁、可直接用。\n\n若用户需要你给出可整理到提示词栏的词条，请使用与「提炼关键词」相同的格式：\n<<<ZHIQUAN_TERMS>>>\n词条每行一个\n<<<END_ZHIQUAN_TERMS>>>';
          sysMerged = internalSys ? (sys + '\n\n---\n\n' + internalSys) : sys;
        }
        var visible = (wfState.collabMessages || []).filter(function (m) { return !m.internal; });
        return [{ role: 'system', content: sysMerged }].concat(visible.slice(-12).map(function (m) { return { role: m.role, content: m.content }; }));
      }

      function fillModelSelect(selectedModel) {
        var sel = document.getElementById('modelSelect');
        if (!sel) return;
        if (!modelList.length && !plugins.length) {
          sel.innerHTML = '<option value="" disabled selected>请添加 API 或插件并保存</option>';
          return;
        }
        var html = '';
        if (modelList.length) {
          var byApi = {};
          modelList.forEach(function (m) {
            var g = m.apiName || '其他';
            if (!byApi[g]) byApi[g] = [];
            byApi[g].push(m);
          });
          Object.keys(byApi).forEach(function (apiName) {
            html += '<optgroup label="' + escapeHtml(apiName) + '">';
            byApi[apiName].forEach(function (m) {
              html += '<option value="' + escapeHtml(m.id) + '"' + (m.id === selectedModel ? ' selected' : '') + '>' + escapeHtml(m.modelId || m.id) + '</option>';
            });
            html += '</optgroup>';
          });
        }
        if (plugins.length) {
          html += '<optgroup label="插件">';
          plugins.forEach(function (pl) {
            var val = 'plugin:' + (pl.id || '');
            html += '<option value="' + escapeHtml(val) + '"' + (val === selectedModel ? ' selected' : '') + '>' + escapeHtml(pl.name || pl.id) + '</option>';
          });
          html += '</optgroup>';
        }
        sel.innerHTML = html;
      }

      function getApiForModel(compositeId) {
        var m = modelList.find(function (x) { return x.id === compositeId; });
        return m ? { base: m.apiBase, key: m.apiKey || 'sk-1234' } : null;
      }

      function getPluginById(pluginId) {
        return plugins.find(function (p) { return (p.id || '') === pluginId; });
      }
      var CURSOR_PLUGIN = { id: 'cursor', name: 'Cursor / 本助手', endpoint: '', apiKey: '', builtin: true };
      function injectCursorPlugin() {
        if (!plugins.some(function (p) { return (p.id || '') === 'cursor'; })) plugins.unshift(CURSOR_PLUGIN);
      }
      function renderPluginBookmarks() {
        var container = document.getElementById('pluginBookmarksContainer');
        if (!container) return;
        var conv = getCurrentConversation();
        var currentVal = conv && conv.model ? conv.model : '';
        container.innerHTML = plugins.map(function (pl) {
          var id = pl.id || '';
          var name = (pl.name || pl.id || '插件').trim() || id;
          var val = 'plugin:' + id;
          var active = currentVal === val ? ' active' : '';
          return '<button type="button" class="plugin-bookmark' + active + '" data-plugin-id="' + escapeHtml(id) + '" title="切换到此插件">' + escapeHtml(name) + '</button>';
        }).join('');
        container.querySelectorAll('.plugin-bookmark').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-plugin-id');
            if (!id) return;
            var conv = getCurrentConversation();
            if (conv) {
              conv.model = 'plugin:' + id;
              saveState();
              fillModelSelect(conv.model);
              renderPluginBookmarks();
            }
          });
        });
      }

      function getCurrentConversation() {
        return conversations.find(function (c) { return String(c.id) === currentTabId; });
      }

      var EXT_STATE_KEY = 'zq_ext_state';
      var EXT_CURRENT_CODE_KEY = 'zq_current_ext_code';
      var EXT_PREV_CODE_KEY = 'zq_prev_ext_code';
      var EXT_SAVED_VERSIONS_KEY = 'zq_ext_saved_versions';
      function createExtAPI() {
        return {
          version: '1.0',
          addPanel: function (id, name, htmlOrFn) {
            var container = document.getElementById('extPanelsContainer');
            if (!container) return;
            var existing = document.getElementById('ext-panel-' + id);
            if (existing) existing.remove();
            var wrap = document.createElement('div');
            wrap.className = 'ext-panel';
            wrap.id = 'ext-panel-' + id;
            var content = typeof htmlOrFn === 'function' ? htmlOrFn() : (htmlOrFn || '');
            wrap.innerHTML = '<h4>' + (name || id) + '</h4><div class="ext-panel-body">' + content + '</div>';
            container.appendChild(wrap);
          },
          toast: function (msg) {
            var el = document.getElementById('extToast');
            if (!el) return;
            el.textContent = msg || '';
            el.classList.add('show');
            setTimeout(function () { el.classList.remove('show'); }, 2500);
          },
          getMessages: function () {
            var c = getCurrentConversation();
            return c && c.messages ? c.messages.slice() : [];
          },
          getState: function (key) {
            try {
              var raw = localStorage.getItem(EXT_STATE_KEY);
              var o = raw ? JSON.parse(raw) : {};
              return key == null ? o : o[key];
            } catch (e) { return key == null ? {} : undefined; }
          },
          setState: function (key, value) {
            try {
              var raw = localStorage.getItem(EXT_STATE_KEY);
              var o = raw ? JSON.parse(raw) : {};
              if (key != null) { o[key] = value; }
              localStorage.setItem(EXT_STATE_KEY, JSON.stringify(o));
            } catch (e) {}
          },
          runCode: function (code) {
            if (typeof code !== 'string') return;
            try {
              var fn = new Function('ext', code);
              fn(window.ZhiQuanExt);
            } catch (e) {
              window.ZhiQuanExt.toast('运行错误: ' + (e && e.message));
            }
          }
        };
      }
      window.ZhiQuanExt = createExtAPI();
      try { window.OVOExt = window.ZhiQuanExt; } catch (e) {}

      function runExtensionCodeInternal(code) {
        if (typeof code !== 'string' || !code.trim()) return;
        var fn = new Function('ext', 'try { (function(ext){ ' + code + ' })(ext); } catch(e) { if(window.ZhiQuanExt) window.ZhiQuanExt.toast("错误: " + (e.message||e)); }');
        fn(window.ZhiQuanExt);
      }
      function runExtensionCode(code) {
        if (typeof code !== 'string' || !code.trim()) return;
        try {
          var prev = '';
          try { prev = localStorage.getItem(EXT_CURRENT_CODE_KEY) || ''; } catch (e) {}
          try { localStorage.setItem(EXT_PREV_CODE_KEY, prev); localStorage.setItem(EXT_CURRENT_CODE_KEY, code); } catch (e) {}
          runExtensionCodeInternal(code);
          window.ZhiQuanExt.toast('拓展代码已执行');
        } catch (e) {
          window.ZhiQuanExt.toast('运行错误: ' + (e && e.message));
        }
      }
      function rollbackExtension() {
        try {
          var prev = localStorage.getItem(EXT_PREV_CODE_KEY) || '';
          if (!prev.trim()) {
            if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('无上一版本可回滚');
            return;
          }
          localStorage.setItem(EXT_CURRENT_CODE_KEY, prev);
          localStorage.removeItem(EXT_PREV_CODE_KEY);
          runExtensionCodeInternal(prev);
          if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已回滚到上一版本（仅可回滚一次）');
        } catch (e) {
          if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('回滚失败: ' + (e && e.message));
        }
      }
      function releaseVersionExtension() {
        try {
          var container = document.getElementById('extPanelsContainer');
          if (container) container.innerHTML = '';
          localStorage.removeItem(EXT_PREV_CODE_KEY);
          localStorage.removeItem(EXT_CURRENT_CODE_KEY);
          try { localStorage.removeItem(EXT_STATE_KEY); } catch (e) {}
          if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已恢复为发布版本');
        } catch (e) {
          if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('恢复失败: ' + (e && e.message));
        }
      }
      function getSavedExtensionVersions() {
        try {
          var raw = localStorage.getItem(EXT_SAVED_VERSIONS_KEY);
          var list = raw ? JSON.parse(raw) : [];
          return Array.isArray(list) ? list : [];
        } catch (e) { return []; }
      }
      function saveSavedExtensionVersions(list) {
        try { localStorage.setItem(EXT_SAVED_VERSIONS_KEY, JSON.stringify(list)); } catch (e) {}
      }
      function saveCurrentExtensionAsVersion(name) {
        var code = localStorage.getItem(EXT_CURRENT_CODE_KEY) || '';
        if (!code.trim()) {
          if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('当前无拓展代码可保存');
          return;
        }
        var state = '';
        try { state = localStorage.getItem(EXT_STATE_KEY) || ''; } catch (e) {}
        var list = getSavedExtensionVersions();
        var id = 'v' + Date.now();
        var label = (name && String(name).trim()) || ('保存 ' + new Date().toLocaleString());
        list.push({ id: id, name: label, code: code, state: state, timestamp: Date.now() });
        saveSavedExtensionVersions(list);
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已保存为: ' + label);
      }
      function restoreExtensionToSavedVersion(saved) {
        if (!saved || !saved.code) return;
        try {
          if (saved.state) localStorage.setItem(EXT_STATE_KEY, saved.state);
          else try { localStorage.removeItem(EXT_STATE_KEY); } catch (e) {}
          var container = document.getElementById('extPanelsContainer');
          if (container) container.innerHTML = '';
          localStorage.setItem(EXT_CURRENT_CODE_KEY, saved.code);
          localStorage.removeItem(EXT_PREV_CODE_KEY);
          runExtensionCodeInternal(saved.code);
          if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已恢复到: ' + (saved.name || '已保存版本'));
        } catch (e) {
          if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('恢复失败: ' + (e && e.message));
        }
      }
      function removeSavedExtensionVersion(id) {
        var list = getSavedExtensionVersions().filter(function (v) { return v.id !== id; });
        saveSavedExtensionVersions(list);
      }
      function showRollbackModal() {
        var overlay = document.getElementById('rollbackExtModalOverlay');
        if (!overlay) return;
        var listEl = document.getElementById('rollbackSavedList');
        var prevBtn = document.getElementById('rollbackPrevVersionBtn');
        var releaseBtn = document.getElementById('rollbackReleaseBtn');
        var saved = getSavedExtensionVersions();
        listEl.innerHTML = saved.length ? saved.map(function (v) {
          var t = (v.name || v.id) + ' (' + (v.timestamp ? new Date(v.timestamp).toLocaleString() : '') + ')';
          return '<div class="rollback-saved-item"><button type="button" class="btn btn-small rollback-restore-btn" data-id="' + escapeHtml(v.id) + '">恢复</button><button type="button" class="btn btn-small btn-ghost rollback-delete-btn" data-id="' + escapeHtml(v.id) + '" title="删除该保存">删除</button><span class="rollback-saved-label">' + escapeHtml(t) + '</span></div>';
        }).join('') : '<p class="api-panel-desc" style="margin:0;">暂无已保存的版本</p>';
        listEl.querySelectorAll('.rollback-restore-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            var v = saved.find(function (x) { return x.id === id; });
            if (v) { restoreExtensionToSavedVersion(v); overlay.classList.remove('show'); }
          });
        });
        listEl.querySelectorAll('.rollback-delete-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            removeSavedExtensionVersion(id);
            showRollbackModal();
          });
        });
        if (prevBtn) prevBtn.onclick = function () {
          var prev = localStorage.getItem(EXT_PREV_CODE_KEY) || '';
          if (!prev.trim()) {
            if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('无上一版本可回滚');
            return;
          }
          rollbackExtension();
          overlay.classList.remove('show');
        };
        if (releaseBtn) releaseBtn.onclick = function () {
          releaseVersionExtension();
          overlay.classList.remove('show');
        };
        overlay.classList.add('show');
      }
      function restoreSavedExtensionOnLoad() {
        try {
          var code = localStorage.getItem(EXT_CURRENT_CODE_KEY) || '';
          if (code.trim()) {
            runExtensionCodeInternal(code);
          }
        } catch (e) {}
      }
      function refreshBrowserCapture() {
        fetch(window.location.origin + '/api/browser-data')
          .then(function (r) { return r.json(); })
          .then(function (data) {
            lastBrowserCapture = data;
            var el = document.getElementById('browserCaptureDisplay');
            if (!el) return;
            if (!data || (!data.url && !data.title && !data.content && !data.selection)) {
              el.innerHTML = '<span class="empty">暂无浏览器推送数据。请使用书签或扩展推送当前页面。</span>';
              el.classList.add('empty');
              return;
            }
            el.classList.remove('empty');
            var title = escapeHtml(data.title || '(无标题)');
            var url = escapeHtml(data.url || '');
            var snippet = (data.selection && data.selection.trim()) ? data.selection.trim() : (data.content || '').trim();
            if (snippet.length > 500) snippet = snippet.substring(0, 500) + '…';
            snippet = escapeHtml(snippet).replace(/\n/g, '<br>');
            el.innerHTML = '<div class="bc-title">' + title + '</div><div class="bc-url">' + url + '</div><div class="bc-snippet">' + snippet + '</div>';
          })
          .catch(function () {
            var el = document.getElementById('browserCaptureDisplay');
            if (el) { el.innerHTML = '<span class="empty">读取失败</span>'; el.classList.add('empty'); }
          });
      }
      function insertBrowserCaptureToInput() {
        if (!lastBrowserCapture) {
          refreshBrowserCapture();
          setTimeout(function () {
            if (lastBrowserCapture) doInsertBrowserCapture(); else if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('请先推送浏览器数据或点「读取最新」');
          }, 500);
          return;
        }
        doInsertBrowserCapture();
      }
      function doInsertBrowserCapture() {
        if (!lastBrowserCapture) return;
        var text = (lastBrowserCapture.selection && lastBrowserCapture.selection.trim()) ? lastBrowserCapture.selection : (lastBrowserCapture.content || '');
        var name = (lastBrowserCapture.title || '页面') + '.txt';
        if (!text.trim()) text = '【' + (lastBrowserCapture.title || '') + '】' + (lastBrowserCapture.url || '');
        currentAttachments.push({ type: 'text', name: name, data: text.substring(0, 100000) });
        renderAttachmentList();
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已插入到当前输入附件');
      }
      function createExtHelpConversation() {
        fetch(window.location.origin + '/api/app-code')
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var codeContent = (data && data.content) ? data.content : '(未获取到拓展说明)';
            var intro = '我正在进行' + APP_NAME + '自我拓展开发，请根据以下附件中的' + APP_NAME + '相关代码协助我。';
            var fullContent = intro + '\n\n【' + APP_NAME + '拓展 API 与说明】\n' + codeContent;
            var newConv = { id: tabIdCounter++, model: getCurrentConversation() ? getCurrentConversation().model : (modelList[0] && modelList[0].id) || '', messages: [{ role: 'user', content: fullContent }] };
            conversations.push(newConv);
            currentTabId = String(newConv.id);
            saveState();
            renderTabs();
            fillModelSelect(newConv.model);
            renderPluginBookmarks();
            renderMessages(newConv.messages);
            updateMeetingPanelVisibility();
            var sendBtn = document.getElementById('sendBtn');
            if (sendBtn) requestReplyForCurrentConversation(sendBtn);
          })
          .catch(function (e) {
            if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('获取代码失败: ' + (e && e.message));
          });
      }

      window.__extCodeMap = window.__extCodeMap || {};
      function formatMessageContent(content, allowApplyExt) {
        if (!content) return '';
        var s = String(content);
        if (!allowApplyExt || s.indexOf('```') === -1) return escapeHtml(s).replace(/\n/g, '<br>');
        var parts = [];
        var re = /```(?:javascript|js)?\s*\n?([\s\S]*?)```/gi;
        var last = 0;
        var match;
        while ((match = re.exec(s)) !== null) {
          parts.push(escapeHtml(s.slice(last, match.index)).replace(/\n/g, '<br>'));
          var code = match[1].trim();
          var id = 'ec-' + Date.now() + '-' + Math.random().toString(36).slice(2);
          window.__extCodeMap[id] = code;
          parts.push('<div class="code-block-wrap"><pre>' + escapeHtml(match[1]) + '</pre><button type="button" class="apply-ext-btn" data-ext-id="' + escapeHtml(id) + '">应用为拓展</button></div>');
          last = match.index + match[0].length;
        }
        parts.push(escapeHtml(s.slice(last)).replace(/\n/g, '<br>'));
        return parts.join('');
      }

      function renderTabs() {
        var container = document.getElementById('tabs');
        if (!container) return;
        var wfActive = mainView === 'workflow';
        var workflowTabHtml = '<div class="tab' + (wfActive ? ' active' : '') + '" data-view="workflow" title="批量生成多张图片并抽卡挑选">🖼️ 图片生成</div>';
        container.innerHTML = workflowTabHtml + conversations.map(function (c) {
          var isActive = String(c.id) === currentTabId;
          var isMeeting = c.meetingOrder && c.meetingOrder.length >= 0;
          var label = isMeeting ? '会议 ' + c.id : '对话 ' + c.id;
          var modelName = (modelList.find(function (m) { return m.id === c.model; }) || {}).name || c.model;
          return '<div class="tab' + (isActive ? ' active' : '') + '" data-id="' + c.id + '">' + label + ' <span class="tab-close" data-id="' + c.id + '" title="关闭">×</span></div>';
        }).join('') + '<span class="add-tab" id="addTab" title="新对话">+ 新对话</span><span class="add-tab" id="addMeetingTab" title="新建会议">+ 会议</span><span class="tab-actions"><button type="button" class="btn-tab-action" id="exportConvBtn" title="把当前对话导出为 JSON，可粘贴到 B 软件或保存到工作区">导出对话</button><button type="button" class="btn-tab-action" id="importConvBtn" title="从文件或粘贴的 JSON 导入对话，在' + APP_NAME + '中换 AI 继续聊">导入对话</button></span>';
        var workflowTab = container.querySelector('.tab[data-view="workflow"]');
        if (workflowTab) workflowTab.addEventListener('click', function () { mainView = 'workflow'; saveState(); showWorkflowView(); renderTabs(); });
        container.querySelectorAll('.tab').forEach(function (tab) {
          tab.addEventListener('click', function (e) {
            if (tab.getAttribute('data-view') === 'workflow') return;
            if (e.target.classList.contains('tab-close')) {
              e.stopPropagation();
              closeTab(parseInt(e.target.dataset.id, 10));
              return;
            }
            switchTab(String(tab.dataset.id));
          });
        });
        document.getElementById('addTab').onclick = addTab;
        var addMeetingEl = document.getElementById('addMeetingTab');
        if (addMeetingEl) addMeetingEl.onclick = addMeetingTab;
        setupExportImportConv();
      }

      function setupExportImportConv() {
        var exportBtn = document.getElementById('exportConvBtn');
        var importBtn = document.getElementById('importConvBtn');
        var importOverlay = document.getElementById('importConvModalOverlay');
        var importText = document.getElementById('importConvText');
        var importFileInput = document.getElementById('importConvFileInput');
        var importConfirm = document.getElementById('importConvConfirm');
        var importCancel = document.getElementById('importConvCancel');
        var selectFileBtn = document.getElementById('importConvSelectFile');
        if (exportBtn) exportBtn.onclick = function () {
          var conv = getCurrentConversation();
          if (!conv) return;
          var payload = {
            version: '1',
            source: APP_NAME,
            messages: conv.messages || [],
            model: conv.model || '',
            meetingOrder: conv.meetingOrder || null,
            exported_at: new Date().toISOString()
          };
          var jsonStr = JSON.stringify(payload, null, 2);
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(jsonStr);
          } catch (e) {}
          fetch(window.location.origin + '/api/export-conversation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: jsonStr
          }).then(function (r) { return r.json(); }).then(function (data) {
            if (data.ok) {
              if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已导出到工作区并已复制，可粘贴到 B 软件');
              else alert('已导出并写入 zhiquan_workspace/conversation_export.json，已复制到剪贴板，可粘贴到其他 AI 软件。');
            } else { alert(data.error || '导出失败'); }
          }).catch(function (e) { alert('导出失败: ' + (e.message || e)); });
        };
        if (importBtn) importBtn.onclick = function () {
          if (importOverlay) importOverlay.style.display = 'flex';
          if (importText) importText.value = '';
          if (importFileInput) importFileInput.value = '';
        };
        if (selectFileBtn && importFileInput) selectFileBtn.onclick = function () { importFileInput.click(); };
        if (importFileInput) importFileInput.onchange = function () {
          var f = (this.files || [])[0];
          if (!f) return;
          var r = new FileReader();
          r.onload = function () {
            if (importText) importText.value = r.result || '';
          };
          r.readAsText(f, 'UTF-8');
        };
        if (importConfirm && importText) importConfirm.onclick = function () {
          var raw = (importText.value || '').trim();
          if (!raw) { alert('请粘贴 JSON 或选择文件'); return; }
          var data = null;
          try { data = JSON.parse(raw); } catch (e) { alert('JSON 格式无效'); return; }
          var messages = data.messages || data.conversation;
          if (!Array.isArray(messages) || !messages.length) {
            alert('JSON 中需包含 messages 数组'); return;
          }
          var newConv = {
            id: tabIdCounter++,
            model: data.model && modelList.some(function (m) { return m.id === data.model; }) ? data.model : (modelList[0] && modelList[0].id) || '',
            messages: messages,
            meetingOrder: data.meetingOrder || null
          };
          conversations.push(newConv);
          currentTabId = String(newConv.id);
          saveState();
          renderTabs();
          fillModelSelect(newConv.model);
          renderMessages(newConv.messages);
          updateMeetingPanelVisibility();
          if (importOverlay) importOverlay.style.display = 'none';
          if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已导入，可换模型继续聊');
        };
        if (importCancel) importCancel.onclick = function () {
          if (importOverlay) importOverlay.style.display = 'none';
        };
        if (importOverlay) importOverlay.onclick = function (e) {
          if (e.target === importOverlay) importOverlay.style.display = 'none';
        };
      }

      function addMeetingTab() {
        var conv = { id: tabIdCounter++, model: (modelList[0] && modelList[0].id) || '', messages: [], meetingOrder: [] };
        conversations.push(conv);
        currentTabId = String(conv.id);
        saveState();
        renderTabs();
        switchTab(currentTabId);
        updateMeetingPanelVisibility();
        renderMeetingOrderList();
        fillModelSelect('');
        renderMessages([]);
      }

      function switchTab(id) {
        currentTabId = id;
        mainView = 'chat';
        saveState();
        renderTabs();
        showChatView();
        var conv = getCurrentConversation();
        if (conv) {
          fillModelSelect(conv.model);
          renderPluginBookmarks();
          renderMessages(conv.messages);
          updateMeetingPanelVisibility();
          if (conv.meetingOrder) renderMeetingOrderList();
        }
      }

      function closeTab(id) {
        var idx = conversations.findIndex(function (c) { return c.id === id; });
        if (idx === -1) return;
        conversations.splice(idx, 1);
        if (!conversations.length) {
          conversations = [{ id: tabIdCounter++, model: (modelList[0] && modelList[0].id) || '', messages: [] }];
          currentTabId = String(conversations[0].id);
        } else if (String(id) === currentTabId) {
          currentTabId = String(conversations[Math.min(idx, conversations.length - 1)].id);
        }
        saveState();
        renderTabs();
        if (mainView !== 'workflow') showChatView();
        var conv = getCurrentConversation();
        if (conv) {
          fillModelSelect(conv.model);
          renderPluginBookmarks();
          renderMessages(conv.messages);
        }
      }

      function addTab() {
        var conv = { id: tabIdCounter++, model: (modelList[0] && modelList[0].id) || '', messages: [] };
        conversations.push(conv);
        currentTabId = String(conv.id);
        saveState();
        renderTabs();
        fillModelSelect(conv.model);
        renderPluginBookmarks();
        renderMessages([]);
      }

      function showThinking(displayName) {
        var el = document.getElementById('thinkingIndicator');
        if (el) {
          el.textContent = displayName ? (displayName + ' 正在思考…') : '正在思考…';
          el.style.display = 'block';
        }
        var container = document.getElementById('messages');
        if (container) container.scrollTop = container.scrollHeight;
      }

      function hideThinking() {
        var el = document.getElementById('thinkingIndicator');
        if (el) el.style.display = 'none';
      }

      function renderMessages(messages) {
        var listEl = document.getElementById('messagesList');
        if (!listEl) return;
        if (!messages || !messages.length) {
          var conv = getCurrentConversation();
          var isMeeting = conv && conv.meetingOrder && conv.meetingOrder.length > 0;
          var emptyTip = isMeeting
            ? '在下方添加参会 AI 并输入消息，将按顺序请每个 AI 阅读上文后发言。'
            : '在下方选择模型并输入消息开始对话。可点击「+ 会议」或「会议模式」将多个 AI 拉入同一对话。';
          listEl.innerHTML = '<div class="empty-chat">' + emptyTip + '</div>';
        } else {
          listEl.innerHTML = messages.map(function (m, i) {
            var label = m.role === 'user' ? '你' : (m.speaker || 'AI') + (m.modelId ? ' · ' + escapeHtml(m.modelId) : '');
            var body;
            if (m.role === 'assistant' && m.isImage && (m.images && Array.isArray(m.images) && m.images.length)) {
              body = '<div class="wf-gallery" style="grid-template-columns:repeat(4,minmax(0,1fr));">' + m.images.map(function (src) {
                return '<div class="wf-card" style="cursor:default;"><img class="msg-img" src="' + escapeHtml(src) + '" alt="生成的图片" /></div>';
              }).join('') + '</div>';
            } else if (m.role === 'assistant' && m.isImage && m.content) {
              body = '<img class="msg-img" src="' + escapeHtml(m.content) + '" alt="生成的图片" />';
            } else if (m.role === 'assistant') {
              body = formatMessageContent(m.content, true);
            } else if (Array.isArray(m.content)) {
              var parts = [];
              m.content.forEach(function (block) {
                if (block.type === 'text') parts.push('<div class="msg-user-text">' + escapeHtml(block.text).replace(/\n/g, '<br>') + '</div>');
                else if (block.type === 'image_url' && block.image_url && block.image_url.url)
                  parts.push('<div class="msg-user-img"><img class="msg-img" src="' + escapeHtml(block.image_url.url) + '" alt="附件" /></div>');
              });
              body = parts.join('');
            } else {
              body = escapeHtml(m.content || '').replace(/\n/g, '<br>');
            }
            var usageHtml = '';
            if (m && m.role === 'assistant' && m.usage && (m.usage.totalTokens || m.usage.promptTokens || m.usage.completionTokens)) {
              var parts = [];
              if (m.usage.promptTokens != null) parts.push('prompt ' + m.usage.promptTokens);
              if (m.usage.completionTokens != null) parts.push('completion ' + m.usage.completionTokens);
              if (m.usage.totalTokens != null) parts.push('total ' + m.usage.totalTokens);
              usageHtml = '<div class="msg-usage">tokens：' + escapeHtml(parts.join(' / ')) + '</div>';
            }
            var actionsHtml = (m.role === 'assistant') ? '<div class="msg-actions"><button type="button" class="msg-action-btn btn-forward" data-msg-index="' + i + '">转给 B（A→B）</button></div>' : '';
            return '<div class="msg ' + m.role + '"><span class="role-label">' + escapeHtml(label) + '</span><div class="msg-content">' + body + '</div>' + usageHtml + actionsHtml + '</div>';
          }).join('');
          listEl.querySelectorAll('.btn-forward').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var conv = getCurrentConversation();
              if (!conv || !conv.messages) return;
              var idx = parseInt(btn.getAttribute('data-msg-index'), 10);
              var msg = conv.messages[idx];
              if (!msg || msg.role !== 'assistant') return;
              var contentText = getMessageText(msg);
              if (!contentText) contentText = '(无文本内容)';
              showForwardDropdown(btn, contentText);
            });
          });
          listEl.querySelectorAll('.apply-ext-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var id = btn.getAttribute('data-ext-id');
              if (id && window.__extCodeMap && window.__extCodeMap[id]) runExtensionCode(window.__extCodeMap[id]);
            });
          });
        }
        var container = document.getElementById('messages');
        if (container) container.scrollTop = container.scrollHeight;
      }

      function escapeHtml(s) {
        if (s == null) return '';
        var div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
      }

      function extractTokenUsage(data) {
        try {
          var u = data && data.usage ? data.usage : null;
          if (!u) return null;
          var prompt = (u.prompt_tokens != null) ? u.prompt_tokens : u.promptTokens;
          var completion = (u.completion_tokens != null) ? u.completion_tokens : u.completionTokens;
          var total = (u.total_tokens != null) ? u.total_tokens : u.totalTokens;
          if (prompt == null && completion == null && total == null) return null;
          return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
        } catch (e) { return null; }
      }

      function showApiError(msg) {
        var text = msg || '请求失败，请确认 LiteLLM 已启动（端口 4000）且 config 中模型 API Key 已配置。';
        var el = document.getElementById('apiError');
        var wfEl = document.getElementById('wfError');
        if (mainView === 'workflow' && wfEl) {
          wfEl.removeAttribute('data-wf-hint');
          wfEl.classList.remove('wf-warn');
          wfEl.classList.add('wf-err');
          wfEl.textContent = text;
          wfEl.style.display = 'block';
          if (el) { el.style.display = 'none'; el.textContent = ''; }
        } else {
          if (el) {
            el.textContent = text;
            el.style.display = 'block';
          }
          if (wfEl) { wfEl.style.display = 'none'; wfEl.textContent = ''; }
        }
        if (mainView === 'workflow' && window.ZhiQuanExt && window.ZhiQuanExt.toast) {
          try { window.ZhiQuanExt.toast(text.length > 120 ? text.slice(0, 120) + '…' : text); } catch (e) {}
        }
      }

      function clearApiError() {
        var el = document.getElementById('apiError');
        var wfEl = document.getElementById('wfError');
        if (el) { el.style.display = 'none'; el.textContent = ''; }
        if (wfEl) {
          wfEl.style.display = 'none';
          wfEl.textContent = '';
          wfEl.removeAttribute('data-wf-hint');
          wfEl.classList.remove('wf-warn', 'wf-err');
        }
      }

      (function () {
        var modelSelectEl = document.getElementById('modelSelect');
        if (modelSelectEl) modelSelectEl.addEventListener('change', function () {
          var conv = getCurrentConversation();
          if (conv) {
            conv.model = this.value;
            saveState();
            renderPluginBookmarks();
          }
        });
      })();

      function updateMeetingPanelVisibility() {
        var conv = getCurrentConversation();
        var modelRow = document.getElementById('modelRow');
        var meetingPanel = document.getElementById('meetingPanel');
        var enterBtn = document.getElementById('enterMeetingBtn');
        if (!conv) {
          if (modelRow) modelRow.style.display = '';
          if (meetingPanel) meetingPanel.style.display = 'none';
          return;
        }
        var isMeeting = conv.meetingOrder !== undefined && conv.meetingOrder !== null;
        if (modelRow) modelRow.style.display = isMeeting ? 'none' : '';
        if (meetingPanel) meetingPanel.style.display = isMeeting ? 'block' : 'none';
        if (enterBtn) enterBtn.style.display = isMeeting ? 'none' : 'inline-block';
      }

      function renderMeetingOrderList() {
        var conv = getCurrentConversation();
        var listEl = document.getElementById('meetingOrderList');
        var selectEl = document.getElementById('meetingAddSelect');
        if (!listEl || !conv) return;
        if (!conv.meetingOrder) conv.meetingOrder = [];
        listEl.innerHTML = conv.meetingOrder.map(function (item, i) {
          return '<div class="meeting-order-item" data-index="' + i + '"><span class="order-num">' + (i + 1) + '.</span><span class="order-name">' + escapeHtml(item.name || item.modelId) + '</span><button type="button" class="order-del">移除</button></div>';
        }).join('');
        listEl.querySelectorAll('.order-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var item = btn.closest('.meeting-order-item');
            var idx = item && parseInt(item.getAttribute('data-index'), 10);
            if (conv.meetingOrder && idx >= 0 && idx < conv.meetingOrder.length) {
              conv.meetingOrder.splice(idx, 1);
              saveState();
              renderMeetingOrderList();
            }
          });
        });
        if (selectEl) {
          var current = selectEl.value;
          selectEl.innerHTML = '<option value="">选择要加入的 AI</option>' + modelList.map(function (m) {
            return '<option value="' + escapeHtml(m.id) + '">' + escapeHtml(m.name) + '</option>';
          }).join('');
          if (current) selectEl.value = current;
        }
      }

      function setupMeetingButtons() {
        var enterBtn = document.getElementById('enterMeetingBtn');
        var addAiBtn = document.getElementById('addMeetingAiBtn');
        var exitBtn = document.getElementById('exitMeetingBtn');
        if (enterBtn) {
          enterBtn.onclick = function () {
            var conv = getCurrentConversation();
            if (!conv) return;
            conv.meetingOrder = [];
            saveState();
            updateMeetingPanelVisibility();
            renderMeetingOrderList();
          };
        }
        if (addAiBtn) {
          addAiBtn.onclick = function () {
            var conv = getCurrentConversation();
            var selectEl = document.getElementById('meetingAddSelect');
            if (!conv || !selectEl || !conv.meetingOrder) return;
            var modelId = selectEl.value;
            if (!modelId) return;
            var m = modelList.find(function (x) { return x.id === modelId; });
            if (m) {
              conv.meetingOrder.push({ modelId: m.id, name: m.name });
              saveState();
              renderMeetingOrderList();
              selectEl.value = '';
            }
          };
        }
        if (exitBtn) {
          exitBtn.onclick = function () {
            var conv = getCurrentConversation();
            if (!conv) return;
            conv.meetingOrder = undefined;
            saveState();
            updateMeetingPanelVisibility();
            fillModelSelect(conv.model);
            renderTabs();
          };
        }
      }

      function getMessageText(m) {
        if (!m || m.isImage) return '';
        var c = m.content;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) return c.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text || ''; }).join('\n');
        return '';
      }

      function showForwardDropdown(anchorBtn, contentToSend) {
        var conv = getCurrentConversation();
        if (!conv) return;
        var others = modelList.filter(function (m) { return m.id && m.id !== conv.model; });
        if (!others.length) {
          showApiError('没有其他可选模型，请先添加并保存 API 或插件。');
          return;
        }
        var dropdown = document.createElement('div');
        dropdown.className = 'forward-dropdown';
        dropdown.innerHTML = others.map(function (m) {
          return '<div class="forward-dropdown-item" data-model-id="' + escapeHtml(m.id) + '">' + escapeHtml(m.name || m.id) + '</div>';
        }).join('');
        var rect = anchorBtn.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = (rect.bottom + 4) + 'px';
        document.body.appendChild(dropdown);
        function closeOut(e) {
          if (!dropdown.contains(e.target) && e.target !== anchorBtn) close();
        }
        function close() {
          if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
          document.removeEventListener('click', closeOut);
        }
        dropdown.querySelectorAll('.forward-dropdown-item').forEach(function (el) {
          el.addEventListener('click', function () {
            var modelId = el.getAttribute('data-model-id');
            close();
            forwardToModel(modelId, contentToSend);
          });
        });
        setTimeout(function () { document.addEventListener('click', closeOut); }, 0);
      }

      function forwardToModel(modelId, contentToSend) {
        var conv = getCurrentConversation();
        var newConv = { id: tabIdCounter++, model: modelId, messages: [{ role: 'user', content: contentToSend }] };
        conversations.push(newConv);
        currentTabId = String(newConv.id);
        saveState();
        renderTabs();
        fillModelSelect(modelId);
        renderMessages(newConv.messages);
        updateMeetingPanelVisibility();
        var sendBtn = document.getElementById('sendBtn');
        requestReplyForCurrentConversation(sendBtn);
      }

      function requestReplyForCurrentConversation(sendBtn) {
        var conv = getCurrentConversation();
        if (!conv || !conv.messages.length || conv.messages[conv.messages.length - 1].role !== 'user') return;
        sendBtn.disabled = true;
        clearApiError();
        if (conv.meetingOrder && conv.meetingOrder.length > 0) {
          runMeetingRound(conv, 0, sendBtn);
          return;
        }
        if (!conv.model) {
          showApiError('请先选择模型。');
          sendBtn.disabled = false;
          return;
        }
        if (conv.model.indexOf('plugin:') === 0) {
          var pluginId = conv.model.replace(/^plugin:/, '');
          var pl = getPluginById(pluginId);
          if (!pl) {
            showApiError('未找到该插件。');
            sendBtn.disabled = false;
            return;
          }
          if (pluginId === 'cursor') {
            var tip = '请到左侧「自我拓展」中点击「导出状态到工作区」，然后在 Cursor 中打开本项目目录，即可基于当前对话继续。';
            conv.messages.push({ role: 'assistant', content: tip, speaker: pl.name, modelId: 'cursor' });
            saveState();
            renderMessages(conv.messages);
            sendBtn.disabled = false;
            return;
          }
          var lastText = getMessageText(conv.messages[conv.messages.length - 1]);
          showThinking(pl.name);
          fetch(window.location.origin + '/api/plugin-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pluginId: pluginId, messages: conv.messages, newMessage: lastText })
          })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (data) {
              hideThinking();
              var content = (data.content != null ? data.content : (data.reply || data.text || '')) || (data.error ? '[插件错误: ' + data.error + ']' : '');
              conv.messages.push({ role: 'assistant', content: content, speaker: pl.name });
              saveState();
              renderMessages(conv.messages);
            })
            .catch(function (err) {
              hideThinking();
              showApiError(err.message || '插件请求失败');
            })
            .finally(function () { sendBtn.disabled = false; });
          return;
        }
        var api = getApiForModel(conv.model);
        if (!api) {
          showApiError('未找到该模型对应的 API。');
          sendBtn.disabled = false;
          return;
        }
        var modelIdOnly = (conv.model.indexOf('::') !== -1) ? conv.model.split('::')[1] : conv.model;
        var messagesForApi = conv.messages.map(function (m) { return { role: m.role, content: m.content }; });
        var dsReq = applyDashScopeVisionIfNeeded(api.base, modelIdOnly, messagesForApi);
        modelIdOnly = dsReq.model;
        messagesForApi = dsReq.messages;
        var modelDisplayName = (modelList.find(function (m) { return m.id === conv.model; }) || {}).name || conv.model;
        showThinking(modelDisplayName);
        fetch(api.base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.key },
          body: JSON.stringify({ model: modelIdOnly, messages: messagesForApi, stream: false })
        })
          .then(function (res) { return res.text().then(function (text) { var data = null; try { data = text ? JSON.parse(text) : null; } catch (e) {} if (!res.ok) throw new Error((data && data.error && data.error.message) ? data.error.message : (res.status + ' ' + res.statusText)); return data || {}; }); })
          .then(function (data) {
            hideThinking();
            var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : '';
            conv.messages.push({ role: 'assistant', content: content, modelId: modelIdOnly, usage: extractTokenUsage(data) });
            saveState();
            renderMessages(conv.messages);
          })
          .catch(function (err) {
            hideThinking();
            showApiError(err.message || '请求失败');
          })
          .finally(function () { sendBtn.disabled = false; });
      }

      function buildUserMessageContent(text) {
        var hasImages = currentAttachments.some(function (a) { return a.type === 'image'; });
        var textParts = [text || ''];
        currentAttachments.forEach(function (a) {
          if (a.type === 'text') textParts.push('[附件 ' + (a.name || '') + ']\n' + (a.data || ''));
        });
        var fullText = textParts.filter(Boolean).join('\n\n').trim() || (hasImages ? '请根据图片内容回答。' : '');
        if (hasImages) {
          var content = [{ type: 'text', text: fullText }];
          currentAttachments.forEach(function (a) {
            if (a.type === 'image' && a.data) content.push({ type: 'image_url', image_url: { url: a.data } });
          });
          return content;
        }
        return fullText || null;
      }

      function renderAttachmentList() {
        var el = document.getElementById('attachmentList');
        if (!el) return;
        var addBtn = document.getElementById('addAttachmentBtn');
        var html = '';
        if (addBtn) html += '<span id="addAttachmentBtn" style="cursor:pointer;color:#7b68ee;">+ 添加附件</span>';
        currentAttachments.forEach(function (a, i) {
          html += ' <span data-index="' + i + '">' + escapeHtml(a.name || (a.type === 'image' ? '图片' : '文件')) + '<span class="att-remove" data-index="' + i + '">×</span></span>';
        });
        if (!html && addBtn) html = '<span id="addAttachmentBtn" style="cursor:pointer;color:#7b68ee;">+ 添加附件</span>';
        el.innerHTML = html || '';
        el.querySelectorAll('.att-remove').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var idx = parseInt(btn.getAttribute('data-index'), 10);
            if (!isNaN(idx) && idx >= 0 && idx < currentAttachments.length) {
              currentAttachments.splice(idx, 1);
              renderAttachmentList();
            }
          });
        });
        var newAdd = document.getElementById('addAttachmentBtn');
        if (newAdd) newAdd.addEventListener('click', function () { document.getElementById('attachmentInput').click(); });
      }

      document.getElementById('addAttachmentBtn').addEventListener('click', function () { document.getElementById('attachmentInput').click(); });
      document.getElementById('attachmentInput').addEventListener('change', function () {
        var files = this.files;
        if (!files || !files.length) return;
        var pending = files.length;
        var done = function () {
          if (--pending === 0) {
            renderAttachmentList();
            this.value = '';
          }
        }.bind(this);
        for (var i = 0; i < files.length; i++) {
          (function (file) {
            var isImage = (file.type || '').indexOf('image/') === 0;
            if (isImage) {
              var r = new FileReader();
              r.onload = function () {
                currentAttachments.push({ type: 'image', name: file.name, data: r.result });
                done();
              };
              r.readAsDataURL(file);
            } else {
              var r2 = new FileReader();
              r2.onload = function () {
                currentAttachments.push({ type: 'text', name: file.name, data: r2.result });
                done();
              };
              r2.readAsText(file, 'UTF-8');
            }
          })(files[i]);
        }
      });

      document.getElementById('chatForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var input = document.getElementById('userInput');
        var text = (input.value || '').trim();
        var content = buildUserMessageContent(text);
        if (!content || (typeof content === 'string' && !content.trim())) return;
        var conv = getCurrentConversation();
        if (!conv) return;
        var sendBtn = document.getElementById('sendBtn');
        sendBtn.disabled = true;
        clearApiError();
        conv.messages.push({ role: 'user', content: content });
        input.value = '';
        currentAttachments = [];
        renderAttachmentList();
        renderMessages(conv.messages);
        saveState();

        if (conv.meetingOrder && conv.meetingOrder.length > 0) {
          runMeetingRound(conv, 0, sendBtn);
          return;
        }
        if (conv.meetingOrder && conv.meetingOrder.length === 0) {
          showApiError('会议模式已开启，请先添加参会 AI 再发送消息。');
          sendBtn.disabled = false;
          conv.messages.pop();
          saveState();
          renderMessages(conv.messages);
          return;
        }
        if (!conv.model) {
          showApiError('请先选择模型或插件，或开启会议模式并添加参会 AI。');
          sendBtn.disabled = false;
          conv.messages.pop();
          saveState();
          renderMessages(conv.messages);
          return;
        }
        if (conv.model.indexOf('plugin:') === 0) {
          var pluginId = conv.model.replace(/^plugin:/, '');
          var pl = getPluginById(pluginId);
          if (!pl) {
            showApiError('未找到该插件，请保存插件后重试。');
            sendBtn.disabled = false;
            conv.messages.pop();
            saveState();
            renderMessages(conv.messages);
            return;
          }
          if (pluginId === 'cursor') {
            hideThinking();
            var tip = '请到左侧「自我拓展」中点击「导出状态到工作区」，然后在 Cursor 中打开本项目目录，即可基于当前对话继续。';
            conv.messages.push({ role: 'assistant', content: tip, speaker: pl.name, modelId: 'cursor' });
            saveState();
            renderMessages(conv.messages);
            sendBtn.disabled = false;
            return;
          }
          showThinking(pl.name);
          fetch(window.location.origin + '/api/plugin-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pluginId: pluginId, messages: conv.messages, newMessage: text })
          })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (data) {
              hideThinking();
              var content = (data.content != null ? data.content : (data.reply || data.text || '')) || (data.error ? '[插件错误: ' + data.error + ']' : '');
              conv.messages.push({ role: 'assistant', content: content, speaker: pl.name });
              saveState();
              renderMessages(conv.messages);
            })
            .catch(function (err) {
              hideThinking();
              conv.messages.pop();
              saveState();
              renderMessages(conv.messages);
              showApiError(err.message || '插件请求失败');
            })
            .finally(function () { sendBtn.disabled = false; });
          return;
        }
        var api = getApiForModel(conv.model);
        if (!api) {
          showApiError('未找到该模型对应的 API，请重新选择模型或保存 API 后刷新。');
          sendBtn.disabled = false;
          conv.messages.pop();
          saveState();
          renderMessages(conv.messages);
          return;
        }
        var modelIdOnly = (conv.model.indexOf('::') !== -1) ? conv.model.split('::')[1] : conv.model;
        var messagesForApi = conv.messages.map(function (m) { return { role: m.role, content: m.content }; });
        var dsChat = applyDashScopeVisionIfNeeded(api.base, modelIdOnly, messagesForApi);
        modelIdOnly = dsChat.model;
        messagesForApi = dsChat.messages;
        var modelDisplayName = (modelList.find(function (m) { return m.id === conv.model; }) || {}).name || conv.model;
        showThinking(modelDisplayName);
        fetch(api.base + '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + api.key
          },
          body: JSON.stringify({
            model: modelIdOnly,
            messages: messagesForApi,
            stream: false
          })
        })
          .then(function (res) {
            return res.text().then(function (text) {
              var data = null;
              try { data = text ? JSON.parse(text) : null; } catch (e) {}
              if (!res.ok) {
                var msg = (data && data.error && data.error.message) ? data.error.message : (res.status + ' ' + res.statusText);
                throw new Error(msg);
              }
              return data || {};
            });
          })
          .then(function (data) {
            hideThinking();
            var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : '';
            conv.messages.push({ role: 'assistant', content: content, modelId: modelIdOnly, usage: extractTokenUsage(data) });
            saveState();
            renderMessages(conv.messages);
          })
          .catch(function (err) {
            hideThinking();
            conv.messages.pop();
            saveState();
            renderMessages(conv.messages);
            var msg = err.message || '请求失败';
            if (msg === 'Failed to fetch' || msg.indexOf('NetworkError') !== -1) {
              msg = '无法连接后端：请用「启动.bat」选 1 打开 OVO 桌面（带 API 代理），并确认 LiteLLM 已运行在 4000 端口。';
            } else if (msg.indexOf('Invalid model name') !== -1 || msg.indexOf('/v1/models') !== -1) {
              msg = '当前模型未就绪。若为 Ollama：请先启动 Ollama 并拉取模型，再重启 LiteLLM（启动.bat 选 2）；或在下拉框中选择其他已就绪的模型。';
            }
            showApiError(msg);
          })
          .finally(function () {
            sendBtn.disabled = false;
          });
      });

      (function bindUserInputEnterSend() {
        var userInputEl = document.getElementById('userInput');
        var chatFormEl = document.getElementById('chatForm');
        if (!userInputEl || !chatFormEl) return;
        userInputEl.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter' || e.shiftKey) return;
          if (e.isComposing || e.keyCode === 229) return;
          e.preventDefault();
          if (typeof chatFormEl.requestSubmit === 'function') {
            chatFormEl.requestSubmit();
          } else {
            var sb = document.getElementById('sendBtn');
            if (sb) sb.click();
          }
        });
      })();

      document.getElementById('genImageBtn').addEventListener('click', function () {
        var input = document.getElementById('userInput');
        var prompt = (input.value || '').trim();
        if (!prompt) {
          showApiError('请先输入图片描述再点击「生成图片」。');
          return;
        }
        var n = 4;
        try {
          var rawN = window.prompt('一次生成几张？建议 4/8（部分 API 不支持太大）', '4');
          if (rawN === null) return;
          var parsedN = parseInt(String(rawN).trim(), 10);
          if (!isNaN(parsedN) && parsedN > 0 && parsedN <= 16) n = parsedN;
        } catch (e) {}
        var size = '512x512';
        try {
          var rawSize = window.prompt('图片尺寸（建议 512x512）', '512x512');
          if (rawSize === null) return;
          var s = String(rawSize).trim();
          if (/^\d+x\d+$/i.test(s)) size = s.toLowerCase();
        } catch (e) {}
        var conv = getCurrentConversation();
        if (!conv || !conv.model) {
          showApiError('请先选择支持图像生成的模型（API）。');
          return;
        }
        if (conv.model.indexOf('plugin:') === 0) {
          showApiError('当前为插件，暂不支持「生成图片」；请选择接入的 API 模型。');
          return;
        }
        var api = getApiForModel(conv.model);
        if (!api) {
          showApiError('未找到该模型对应的 API。');
          return;
        }
        var base = (api.base || '').replace(/\/+$/, '');
        var url = base + '/images/generations';
        var modelDisplayName = (modelList.find(function (m) { return m.id === conv.model; }) || {}).name || conv.model;
        showThinking(modelDisplayName + '（图片生成 ' + n + ' 张）');
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (api.key || '') },
          body: JSON.stringify({ model: 'dall-e-3', prompt: prompt, n: n, size: size })
        })
          .then(function (res) { return res.text().then(function (t) { return { ok: res.ok, text: t }; }); })
          .then(function (r) {
            var data = null;
            try { data = r.text ? JSON.parse(r.text) : null; } catch (e) {}
            if (!r.ok) {
              var msg = (data && data.error && data.error.message) ? data.error.message : (r.text || '请求失败');
              throw new Error(msg);
            }
            var arr = (data && data.data && Array.isArray(data.data)) ? data.data : [];
            var imgs = arr.map(function (item) {
              return item && (item.url || (item.b64_json ? ('data:image/png;base64,' + item.b64_json) : null));
            }).filter(function (x) { return !!x; });
            if (!imgs.length) throw new Error('未返回图片');
            hideThinking();
            conv.messages.push({ role: 'user', content: '[生成图片] ' + prompt + '（' + n + ' 张，' + size + '）' });
            if (imgs.length === 1) conv.messages.push({ role: 'assistant', content: imgs[0], isImage: true, speaker: modelDisplayName, modelId: conv.model });
            else conv.messages.push({ role: 'assistant', content: '', images: imgs, isImage: true, speaker: modelDisplayName, modelId: conv.model });
            input.value = '';
            saveState();
            renderMessages(conv.messages);
          })
          .catch(function (err) {
            hideThinking();
            showApiError(err.message || '图片生成失败。若该 API 不支持 /images/generations，请使用支持画图的接口或模型。');
          });
      });

      function renderWorkflowUI() {
        var promptEl = document.getElementById('wfPrompt');
        var negEl = document.getElementById('wfNegative');
        var recEl = document.getElementById('wfRecommendedPrompt');
        var batchEl = document.getElementById('wfBatchSize');
        var sizeEl = document.getElementById('wfSize');
        var modelEl = document.getElementById('wfImageModel');
        var subdirEl = document.getElementById('wfSaveSubdir');
        var genBackEl = document.getElementById('wfGenBackend');
        var comfyBaseEl = document.getElementById('wfComfyuiBase');
        var collabSel = document.getElementById('wfCollabModel');
        var chatInputEl = document.getElementById('wfChatInput');
        if (promptEl && promptEl.value !== wfState.prompt) promptEl.value = wfState.prompt || '';
        if (negEl && negEl.value !== wfState.negative) negEl.value = wfState.negative || '';
        if (recEl && recEl.value !== wfState.recommendedPrompt) recEl.value = wfState.recommendedPrompt || '';
        if (batchEl) batchEl.value = String(wfState.batchSize || 8);
        if (sizeEl) sizeEl.value = wfState.size || '512x512';
        if (modelEl && modelEl.value !== wfState.imageModel) modelEl.value = wfState.imageModel || 'dall-e-3';
        if (subdirEl && subdirEl.value !== wfState.saveSubdir) subdirEl.value = wfState.saveSubdir || 'pixel';
        if (genBackEl) genBackEl.value = wfState.genBackend || 'comfyui';
        if (comfyBaseEl && comfyBaseEl.value !== wfState.comfyuiBase) comfyBaseEl.value = wfState.comfyuiBase || 'http://127.0.0.1:8188';
        renderWorkflowCollabOptions();
        if (collabSel && wfState.collabModel) collabSel.value = wfState.collabModel;
        renderWorkflowSavedStrip();
        renderWorkflowGallery();
        renderWorkflowSessionSelect();
        renderWorkflowChatMessages();
        renderWorkflowKeywords();
        renderWorkflowStyleUi();
        renderWorkflowRefPanel();
        renderWorkflowFavorites();
        setupWorkflowPromptTermDnD();
        if (chatInputEl && !chatInputEl.value) chatInputEl.value = '';
        updateWfGenBackendSettingsVisibility();
      }

      /** 首次成功出图后折叠「生成后端 / 生成地址」；可点「显示…」再次编辑 */
      function updateWfGenBackendSettingsVisibility() {
        var wrap = document.getElementById('wfGenBackendSettingsWrap');
        var row = document.getElementById('wfShowGenBackendRow');
        if (!wrap) return;
        if (wfState.hideImageGenBackendUi) {
          wrap.classList.add('is-hidden');
          if (row) row.style.display = '';
        } else {
          wrap.classList.remove('is-hidden');
          if (row) row.style.display = 'none';
        }
      }

      function markImageGenBackendReadyAndHideUi() {
        wfState.hideImageGenBackendUi = true;
        saveWorkflowState();
        updateWfGenBackendSettingsVisibility();
      }

      function setWorkflowCollabStatus(s) {
        var el = document.getElementById('wfCollabStatus');
        if (el) el.textContent = s || '';
      }

      function renderWorkflowCollabOptions() {
        var sel = document.getElementById('wfCollabModel');
        if (!sel) return;
        var opts = '';
        // 仅用于“讨论/提词”，与主对话同源 modelList；插件也可作为协同（若实现了 /api/plugin-call）
        var all = [];
        (modelList || []).forEach(function (m) { if (m && m.id) all.push({ id: m.id, name: m.name || m.id }); });
        (plugins || []).forEach(function (p) { if (p && p.id) all.push({ id: 'plugin:' + p.id, name: (p.name || p.id) + '（插件）' }); });
        if (!all.length) {
          sel.innerHTML = '<option value="">暂无可用 AI（请打开「API 储存」添加通义等 API 并保存，或刷新页面）</option>';
          return;
        }
        opts = '<option value="">选择协同 AI…</option>' + all.map(function (x) {
          return '<option value="' + escapeHtml(x.id) + '">' + escapeHtml(x.name) + '</option>';
        }).join('');
        sel.innerHTML = opts;
        if (wfState.collabModel && !all.some(function (x) { return x.id === wfState.collabModel; })) wfState.collabModel = '';
        if (!wfState.collabModel) wfState.collabModel = all[0].id;
        try { sel.value = wfState.collabModel; } catch (e) {}
        saveWorkflowState();
      }

      function renderWorkflowChatMessages() {
        var box = document.getElementById('wfChatMessages');
        if (!box) return;
        var msgs = (wfState.collabMessages || []).filter(function (m) { return !m.internal; });
        if (!msgs.length) {
          box.innerHTML = '<div class="wf-tip">暂无讨论记录。可先描述你要生成的资源，让协同 AI 给建议或提炼关键词。</div>';
        } else {
          box.innerHTML = msgs.map(function (m) {
            var role = m.role === 'user' ? '你' : (m.name || 'AI');
            var bubbleCls = 'wf-chat-bubble' + (m.role === 'user' ? ' user' : '');
            if (m.sessionNotice) bubbleCls += ' wf-chat-notice';
            var body = wfCollabMessageBubbleText(m);
            return '<div class="wf-chat-msg"><div class="wf-chat-role">' + escapeHtml(role) + '</div><div class="' + bubbleCls + '">' + escapeHtml(body) + '</div></div>';
          }).join('');
        }
        box.scrollTop = box.scrollHeight;
      }

      function compressImageFileToDataUrl(file, maxW, maxLen, cb) {
        var reader = new FileReader();
        reader.onload = function () {
          var img = new Image();
          img.onload = function () {
            var w = img.width;
            var h = img.height;
            var scale = Math.min(1, maxW / w);
            var cw = Math.round(w * scale);
            var ch = Math.round(h * scale);
            var canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, cw, ch);
            var q = 0.82;
            var d = '';
            while (q >= 0.42) {
              d = canvas.toDataURL('image/jpeg', q);
              if (d.length <= maxLen) {
                cb(d, null);
                return;
              }
              q -= 0.06;
            }
            cb(null, '图片过大，请换更小图片或截短边长');
          };
          img.onerror = function () { cb(null, '无法读取图片'); };
          img.src = reader.result;
        };
        reader.onerror = function () { cb(null, '读取失败'); };
        reader.readAsDataURL(file);
      }

      function wfIsImageFile(f) {
        if (!f) return false;
        if (f.type && f.type.indexOf('image/') === 0) return true;
        var n = (f.name || '').toLowerCase();
        return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n);
      }

      function wfAddRefImagesFromFiles(fileList) {
        if (!wfState.refImages) wfState.refImages = [];
        var max = 2;
        var maxLen = 300000;
        var raw = Array.prototype.slice.call(fileList || [], 0);
        if (!raw.length) return;
        var arr = raw.filter(wfIsImageFile);
        if (!arr.length) {
          showApiError('请拖入或选择图片文件（PNG / JPG / WebP 等）。');
          return;
        }
        var i = 0;
        function next() {
          if (wfState.refImages.length >= max) {
            if (i < arr.length) showApiError('最多保留 2 张参考图');
            saveWorkflowState();
            renderWorkflowRefPanel();
            return;
          }
          if (i >= arr.length) {
            saveWorkflowState();
            renderWorkflowRefPanel();
            return;
          }
          var file = arr[i++];
          compressImageFileToDataUrl(file, 768, maxLen, function (dataUrl, err) {
            if (err) { showApiError(err); next(); return; }
            if (dataUrl) {
              wfState.refImages.push({ id: 'ref-' + Date.now() + '-' + Math.random().toString(36).slice(2), name: file.name || 'image', dataUrl: dataUrl });
            }
            next();
          });
        }
        next();
      }

      function wfOpenRefFilePicker() {
        var inp = document.getElementById('wfRefFileInput');
        if (inp) inp.click();
      }

      function renderWorkflowRefPanel() {
        var box = document.getElementById('wfRefPreview');
        if (!box) return;
        var list = wfState.refImages || [];
        if (!list.length) {
          box.innerHTML =
            '<div class="wf-ref-placeholder" id="wfRefPlaceholder" role="button" tabindex="0">' +
            '<div class="wf-ref-placeholder-title">将图片拖放到此处</div>' +
            '<div class="wf-ref-placeholder-hint">松开即可展示并作为参考；也可点击此区域从本机选择（最多 2 张）</div>' +
            '</div>';
          var ph = document.getElementById('wfRefPlaceholder');
          if (ph) {
            ph.onclick = function (e) { e.preventDefault(); wfOpenRefFilePicker(); };
            ph.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wfOpenRefFilePicker(); } };
          }
          return;
        }
        var html = list.map(function (ri, i) {
          return '<div class="wf-ref-item"><img src="' + escapeHtml(ri.dataUrl) + '" alt="参考图 ' + (i + 1) + '"/><button type="button" class="btn btn-small btn-ghost wf-ref-remove" data-idx="' + i + '">移除</button></div>';
        }).join('');
        if (list.length < 2) {
          html += '<div class="wf-ref-add-slot" id="wfRefAddSlot" title="继续添加">拖放或点击<br/>添加参考图</div>';
        }
        box.innerHTML = html;
        box.querySelectorAll('.wf-ref-remove').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var ix = parseInt(btn.getAttribute('data-idx'), 10);
            if (isNaN(ix)) return;
            wfState.refImages.splice(ix, 1);
            saveWorkflowState();
            renderWorkflowRefPanel();
          });
        });
        var addSlot = document.getElementById('wfRefAddSlot');
        if (addSlot) {
          addSlot.onclick = function (e) { e.preventDefault(); wfOpenRefFilePicker(); };
        }
      }

      /** 拖放高亮：在参考图区域内拖动文件时高亮边框（避免子节点导致 dragleave 闪烁，用 document 判断） */
      function setupWfRefDropZone() {
        if (document.documentElement.dataset.wfRefDropBound === '1') return;
        document.documentElement.dataset.wfRefDropBound = '1';
        document.addEventListener('dragover', function (e) {
          var dz = document.getElementById('wfRefDropZone');
          if (!dz) return;
          if (dz.contains(e.target)) {
            e.preventDefault();
            try { e.dataTransfer.dropEffect = 'copy'; } catch (err) {}
            dz.classList.add('wf-ref-drop-over');
          } else {
            dz.classList.remove('wf-ref-drop-over');
          }
        });
        document.addEventListener('drop', function (e) {
          var dz = document.getElementById('wfRefDropZone');
          if (!dz) return;
          dz.classList.remove('wf-ref-drop-over');
          if (!dz.contains(e.target)) return;
          e.preventDefault();
          var files = e.dataTransfer && e.dataTransfer.files;
          if (files && files.length) wfAddRefImagesFromFiles(files);
        });
        document.addEventListener('dragend', function () {
          var dz = document.getElementById('wfRefDropZone');
          if (dz) dz.classList.remove('wf-ref-drop-over');
        });
      }

      function clearWorkflowRefImages() {
        wfState.refImages = [];
        saveWorkflowState();
        renderWorkflowRefPanel();
      }

      function runWorkflowRefPrompt() {
        if (!wfState.refImages || !wfState.refImages.length) {
          showApiError('请先上传参考图');
          return;
        }
        var sel = document.getElementById('wfCollabModel');
        wfState.collabModel = sel ? (sel.value || '') : (wfState.collabModel || '');
        if (!wfState.collabModel) {
          showApiError('请选择协同 AI');
          return;
        }
        if (wfState.collabModel.indexOf('plugin:') === 0) {
          showApiError('插件协同不支持参考图，请改用支持视觉的 API 模型（如 gpt-4o、glm-4v 等）。');
          return;
        }
        var inputEl = document.getElementById('wfChatInput');
        var extra = (inputEl ? inputEl.value : '').trim();
        setWorkflowCollabStatus('正在根据参考图生成词条…');
        var sys = '你是图像转提示词助手。用户提供了参考图，请根据画面提炼适合文生图模型的提示词短语（中英文均可）。\n\n【必须】先用 <<<ZHIQUAN_TERMS>>> ... <<<END_ZHIQUAN_TERMS>>> 包裹词条，每行一个短语；再可有简短说明。';
        var internalSys = (wfState.collabMessages || []).filter(function (m) { return m.internal && m.role === 'system'; }).map(function (m) { return m.content; }).join('\n\n');
        var sysMerged = internalSys ? (sys + '\n\n---\n\n' + internalSys) : sys;
        if (!wfState.collabMessages) wfState.collabMessages = [];
        var userContent = wfCollabUserContentWithRefImages(extra, '请根据参考图提炼画风、主体、光影、色彩、构图等，输出可拼接的提示词短语。');
        wfState.collabMessages.push({ role: 'user', content: userContent, refTag: true, ts: Date.now() });
        if (inputEl) inputEl.value = '';
        saveWorkflowState();
        renderWorkflowChatMessages();
        var msgs = buildWorkflowCollabApiMessages('chat', { replaceSystemContent: sysMerged });
        callCollabAi(wfState.collabModel, msgs)
          .then(function (reply) {
            wfState.collabMessages.push({ role: 'assistant', content: reply || '', name: '协同AI', ts: Date.now() });
            var structured = extractZhiquanStructuredTerms(reply || '');
            if (structured && structured.length) {
              wfState.promptTerms = structured;
              wfState.selectedTerms = {};
              syncRecommendedFromTerms();
            } else {
              mergeAssistantTermsIntoState(reply);
            }
            saveWorkflowState();
            setWorkflowCollabStatus('');
            renderWorkflowChatMessages();
            var recEl = document.getElementById('wfRecommendedPrompt');
            if (recEl) recEl.value = wfState.recommendedPrompt || '';
            renderWorkflowKeywords();
            if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已根据参考图更新词条');
          })
          .catch(function (e) {
            setWorkflowCollabStatus('');
            wfState.collabMessages.pop();
            saveWorkflowState();
            renderWorkflowChatMessages();
            showApiError('参考图生词失败：' + (e && e.message ? e.message : e));
          });
      }

      function dedupeTermList(arr) {
        var seen = {};
        var out = [];
        (arr || []).forEach(function (p) {
          p = (p == null ? '' : String(p)).trim();
          if (!p || p.length > 96) return;
          if (seen[p]) return;
          seen[p] = 1;
          out.push(p);
        });
        return out.slice(0, 48);
      }

      /** 解析协同 AI 的固定格式：<<<ZHIQUAN_TERMS>>> ... <<<END_ZHIQUAN_TERMS>>> 或 JSON zhiquan_terms */
      function extractZhiquanStructuredTerms(text) {
        var t = text || '';
        var m = t.match(/<<<ZHIQUAN_TERMS>>>([\s\S]*?)<<<END_ZHIQUAN_TERMS>>>/);
        if (m && m[1]) {
          var block = m[1].trim();
          var lines = block.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
          var out = [];
          lines.forEach(function (line) {
            line.split(/[,，;；]/).forEach(function (p) {
              p = p.trim().replace(/^\d+[\.\)、\s]+/, '').trim();
              if (p) out.push(p);
            });
          });
          var d = dedupeTermList(out);
          if (d.length) return d;
        }
        var jsonBlock = t.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonBlock && jsonBlock[1]) {
          try {
            var j = JSON.parse(jsonBlock[1].trim());
            if (j && Array.isArray(j.zhiquan_terms)) return dedupeTermList(j.zhiquan_terms);
            if (j && Array.isArray(j.terms)) return dedupeTermList(j.terms);
          } catch (e) {}
        }
        try {
          var j2 = JSON.parse(t.trim());
          if (j2 && Array.isArray(j2.zhiquan_terms)) return dedupeTermList(j2.zhiquan_terms);
        } catch (e) {}
        return null;
      }

      function parseKeywordsFromText(text) {
        var structured = extractZhiquanStructuredTerms(text);
        if (structured && structured.length) return structured;
        var t = (text || '').trim();
        if (!t) return [];
        t = t.replace(/```[\s\S]*?```/g, '');
        var parts = t.split(/[\n,，;；、|]+/g).map(function (s) { return (s || '').trim(); }).filter(Boolean);
        parts = parts.map(function (s) { return s.replace(/^\d+[\.\)、\s]+/, '').trim(); }).filter(Boolean);
        var seen = {};
        var out = [];
        parts.forEach(function (p) {
          if (!p) return;
          if (p.length > 60) return;
          if (seen[p]) return;
          seen[p] = 1;
          out.push(p);
        });
        return out.slice(0, 32);
      }

      function syncRecommendedFromTerms() {
        var arr = wfState.promptTerms || [];
        wfState.recommendedPrompt = arr.join(', ');
      }

      function mergeAssistantTermsIntoState(reply) {
        var kws = parseKeywordsFromText(reply || '');
        wfState.promptTerms = kws;
        wfState.selectedTerms = {};
        syncRecommendedFromTerms();
      }

      function renderWorkflowKeywords() {
        var pool = document.getElementById('wfPromptTermsPool');
        var recEl = document.getElementById('wfRecommendedPrompt');
        if (!wfState.promptTerms || !wfState.promptTerms.length) {
          if (wfState.recommendedPrompt && wfState.recommendedPrompt.trim()) {
            wfState.promptTerms = parseKeywordsFromText(wfState.recommendedPrompt);
            syncRecommendedFromTerms();
          }
        }
        if (!wfState.selectedTerms) wfState.selectedTerms = {};
        if (recEl) recEl.value = wfState.recommendedPrompt || '';
        if (!pool) return;
        var terms = wfState.promptTerms || [];
        if (!terms.length) {
          pool.innerHTML = '<span class="wf-tip">暂无词条。在讨论区点「提炼关键词」或让 AI 按固定格式输出。</span>';
          return;
        }
        var sel = wfState.selectedTerms || {};
        pool.innerHTML = terms.map(function (term, idx) {
          var isSel = !!sel[term];
          return '<span class="wf-chip' + (isSel ? ' selected' : '') + '" data-index="' + idx + '" draggable="true" title="点击选择；拖动排序或拖到「使用的提示词」">' + escapeHtml(term) + '</span>';
        }).join('');
        pool.querySelectorAll('.wf-chip').forEach(function (chip) {
          chip.addEventListener('click', function (e) {
            if (e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            var ix = parseInt(chip.getAttribute('data-index'), 10);
            var term = (wfState.promptTerms || [])[ix];
            if (!term) return;
            if (!wfState.selectedTerms) wfState.selectedTerms = {};
            if (wfState.selectedTerms[term]) delete wfState.selectedTerms[term];
            else wfState.selectedTerms[term] = true;
            saveWorkflowState();
            renderWorkflowKeywords();
          });
          chip.addEventListener('dragstart', function (e) {
            var idx = chip.getAttribute('data-index');
            var ix = parseInt(idx, 10);
            var term = (wfState.promptTerms || [])[ix] || '';
            chip.classList.add('wf-chip-dragging');
            e.dataTransfer.setData('application/x-zq-chip-index', idx);
            e.dataTransfer.setData('application/x-zq-term', term);
            e.dataTransfer.setData('text/plain', term);
            e.dataTransfer.effectAllowed = 'move';
          });
          chip.addEventListener('dragend', function () {
            chip.classList.remove('wf-chip-dragging');
            pool.classList.remove('wf-drop-hover');
          });
          chip.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            pool.classList.add('wf-drop-hover');
          });
          chip.addEventListener('dragleave', function () {
            pool.classList.remove('wf-drop-hover');
          });
          chip.addEventListener('drop', function (e) {
            e.preventDefault();
            e.stopPropagation();
            pool.classList.remove('wf-drop-hover');
            var fromStr = e.dataTransfer.getData('application/x-zq-chip-index');
            var toIdx = parseInt(chip.getAttribute('data-index'), 10);
            var from = parseInt(fromStr, 10);
            if (isNaN(from) || isNaN(toIdx) || from === toIdx) return;
            var arr = (wfState.promptTerms || []).slice();
            var item = arr.splice(from, 1)[0];
            arr.splice(toIdx, 0, item);
            wfState.promptTerms = arr;
            syncRecommendedFromTerms();
            saveWorkflowState();
            renderWorkflowKeywords();
          });
        });
      }

      var _wfPromptDnDSetup = false;
      function setupWorkflowPromptTermDnD() {
        var ta = document.getElementById('wfPrompt');
        if (!ta || _wfPromptDnDSetup) return;
        _wfPromptDnDSetup = true;
        ta.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        });
        ta.addEventListener('drop', function (e) {
          e.preventDefault();
          var term = e.dataTransfer.getData('application/x-zq-term') || e.dataTransfer.getData('text/plain');
          if (!term || !term.trim()) return;
          term = term.trim();
          var start = ta.selectionStart != null ? ta.selectionStart : (ta.value || '').length;
          var end = ta.selectionEnd != null ? ta.selectionEnd : start;
          var v = ta.value || '';
          var prefix = v.slice(0, start);
          var trimmed = prefix.replace(/\s+$/, '');
          var needComma = trimmed.length && !/[,，]$/.test(trimmed);
          var insert = (needComma ? ', ' : '') + term + ', ';
          ta.value = v.slice(0, start) + insert + v.slice(end);
          var pos = start + insert.length;
          try { ta.selectionStart = ta.selectionEnd = pos; } catch (err) {}
          ta.focus();
          wfState.prompt = ta.value;
          saveWorkflowState();
          if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已插入词条');
        });
      }

      function collabMessagesHaveVisionParts(messagesForAi) {
        var has = false;
        (messagesForAi || []).forEach(function (msg) {
          var c = msg && msg.content;
          if (Array.isArray(c)) {
            c.forEach(function (part) { if (part && part.type === 'image_url') has = true; });
          }
        });
        return has;
      }

      /** Ollama 的 /v1/chat/completions 常无法解析 OpenAI 多模态块（Rust 仅接受 text）；参考图需走原生 /api/chat + images[] */
      function isOllamaLikeApiBase(apiBase) {
        if (!apiBase) return false;
        var b = String(apiBase).toLowerCase();
        if (b.indexOf('11434') !== -1) return true;
        if (/ollama/i.test(b)) return true;
        return false;
      }

      /** 通义千问 DashScope 兼容端（北京 / 新加坡 / 美东等 *.aliyuncs.com） */
      function isDashScopeApiBase(apiBase) {
        if (!apiBase) return false;
        var b = String(apiBase).toLowerCase();
        return /dashscope\.[a-z0-9.-]*aliyuncs\.com/i.test(b);
      }

      /** DashScope /models 常返回大量型号；下拉只保留兼容模式常用、易开通的一组（含日期后缀的同名快照仍保留原 id） */
      var DASHSCOPE_UI_MODEL_BASE_IDS = ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long', 'qwen-vl-plus', 'qwen-vl-max'];

      function dashScopeNormalizeModelIdForAllowlist(id) {
        var s = (id || '').trim().toLowerCase();
        if (!s) return '';
        s = s.replace(/-latest$/i, '');
        s = s.replace(/-\d{4}-\d{2}-\d{2}(-\d{2}(-\d{2})?)?.*$/i, '');
        return s;
      }

      function isDashScopeUiModelId(modelId) {
        var norm = dashScopeNormalizeModelIdForAllowlist(modelId);
        return !!norm && DASHSCOPE_UI_MODEL_BASE_IDS.indexOf(norm) !== -1;
      }

      /** 含图请求必须用 VL/多模态；纯文本 qwen 模型无法读图 */
      function mapDashScopeModelForVision(modelIdOnly) {
        var id = (modelIdOnly || '').trim();
        if (!id) return id;
        var lower = id.toLowerCase();
        if (/\bvl\b|qwen-vl|omni|vision/i.test(lower)) return id;
        if (!/^qwen/i.test(lower)) return id;
        return 'qwen-vl-plus';
      }

      /** 兼容端示例为 text 在前、image_url 在后；Data URL 中 image/jpg 规范为 image/jpeg */
      function normalizeDashScopeVisionMessages(messages) {
        function fixImagePart(p) {
          if (!p || p.type !== 'image_url' || !p.image_url) return p;
          var url = p.image_url.url;
          if (typeof url === 'string' && /^data:image\/jpg;base64,/i.test(url)) {
            url = url.replace(/^data:image\/jpg;base64,/i, 'data:image/jpeg;base64,');
          }
          var iu = { url: url };
          if (p.image_url.detail) iu.detail = p.image_url.detail;
          return { type: 'image_url', image_url: iu };
        }
        return (messages || []).map(function (m) {
          if (!m || !Array.isArray(m.content)) return m;
          var images = [];
          var rest = [];
          m.content.forEach(function (part) {
            var fp = fixImagePart(part);
            if (fp && fp.type === 'image_url') images.push(fp);
            else rest.push(part);
          });
          return { role: m.role, content: rest.concat(images) };
        });
      }

      /** 阿里云文档：messages 中 user/assistant 需交替；末尾若连续多条 user 会丢图或报错 */
      function dashScopeMergeTrailingTextUsersBeforeVisionUser(messages) {
        if (!messages || messages.length < 2) return messages;
        var out = messages.map(function (m) { return { role: m.role, content: m.content }; });
        var lastIdx = out.length - 1;
        var last = out[lastIdx];
        if (!last || last.role !== 'user' || !Array.isArray(last.content)) return messages;
        var textParts = [];
        var i = lastIdx - 1;
        while (i >= 0 && out[i].role === 'user' && typeof out[i].content === 'string') {
          var c = out[i].content;
          if (c && String(c).trim()) textParts.unshift(String(c).trim());
          i--;
        }
        if (!textParts.length) return messages;
        var combined = textParts.join('\n\n');
        var parts = out[lastIdx].content.map(function (p) { return p; });
        var ti = -1;
        for (var j = 0; j < parts.length; j++) {
          if (parts[j] && parts[j].type === 'text') { ti = j; break; }
        }
        if (ti >= 0) {
          parts[ti] = { type: 'text', text: combined + '\n\n' + (parts[ti].text || '') };
        } else {
          parts.unshift({ type: 'text', text: combined });
        }
        var head = out.slice(0, i + 1);
        return head.concat([{ role: 'user', content: parts }]);
      }

      function applyDashScopeVisionIfNeeded(apiBase, modelIdOnly, messages) {
        if (!isDashScopeApiBase(apiBase) || !collabMessagesHaveVisionParts(messages)) {
          return { model: modelIdOnly, messages: messages };
        }
        var nextModel = mapDashScopeModelForVision(modelIdOnly);
        var nextMsgs = dashScopeMergeTrailingTextUsersBeforeVisionUser(messages);
        nextMsgs = normalizeDashScopeVisionMessages(nextMsgs);
        if (nextModel !== modelIdOnly && window.ZhiQuanExt && window.ZhiQuanExt.toast) {
          window.ZhiQuanExt.toast('已使用「' + nextModel + '」处理参考图（DashScope 需 VL 多模态模型）');
        }
        return { model: nextModel, messages: nextMsgs };
      }

      /** DashScope 兼容端常返回空的 /models；仅补白名单内型号（与 isDashScopeUiModelId 一致） */
      function appendDashScopeFallbackModelsIfEmpty(api, base, key, countAdded) {
        if (countAdded > 0 || !isDashScopeApiBase(base)) return;
        DASHSCOPE_UI_MODEL_BASE_IDS.forEach(function (mid) {
          modelList.push({
            id: api.id + '::' + mid,
            modelId: mid,
            apiId: api.id,
            apiName: api.name || api.id,
            apiBase: base,
            apiKey: key,
            name: (api.name || api.id) + ' · ' + mid
          });
        });
      }

      function stripDataUrlToRawBase64(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return '';
        var m = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/i);
        return m ? m[1] : dataUrl.replace(/^data:image\/[^;]+;base64,/i, '');
      }

      function normalizeOllamaApiRoot(base) {
        var b = (base || '').replace(/\/+$/, '');
        if (b.endsWith('/v1')) b = b.slice(0, -3);
        return b.replace(/\/+$/, '');
      }

      /** 将 OpenAI 风格 messages（含 content 数组 + image_url）转为 Ollama /api/chat 的 messages */
      function convertOpenAiMessagesToOllama(messagesForAi) {
        var out = [];
        (messagesForAi || []).forEach(function (m) {
          if (!m || !m.role) return;
          var c = m.content;
          if (typeof c === 'string') {
            out.push({ role: m.role, content: c });
            return;
          }
          if (!Array.isArray(c)) {
            out.push({ role: m.role, content: '' });
            return;
          }
          var texts = [];
          var images = [];
          c.forEach(function (part) {
            if (!part) return;
            if (part.type === 'text' && part.text) texts.push(part.text);
            if (part.type === 'image_url' && part.image_url && part.image_url.url) {
              var raw = stripDataUrlToRawBase64(part.image_url.url);
              if (raw) images.push(raw);
            }
          });
          var om = { role: m.role, content: texts.join('\n') };
          if (images.length) om.images = images;
          out.push(om);
        });
        return out;
      }

      function callOllamaNativeChat(api, modelIdOnly, messagesForAi) {
        var root = normalizeOllamaApiRoot(api.base);
        var ollamaMsgs = convertOpenAiMessagesToOllama(messagesForAi);
        var headers = { 'Content-Type': 'application/json' };
        if (api.key) headers['Authorization'] = 'Bearer ' + api.key;
        return fetch(root + '/api/chat', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ model: modelIdOnly, messages: ollamaMsgs, stream: false })
        })
          .then(function (res) {
            return res.text().then(function (text) {
              var data = null;
              try { data = text ? JSON.parse(text) : null; } catch (e) {}
              if (!res.ok) {
                var errMsg = (data && data.error) ? (typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error))) : (text || res.status + ' ' + res.statusText);
                throw new Error(errMsg);
              }
              return data || {};
            });
          })
          .then(function (data) {
            if (data.message && data.message.content) return data.message.content;
            if (data.response) return data.response;
            return '';
          });
      }

      function callCollabAi(modelId, messagesForAi) {
        if (!modelId) return Promise.reject(new Error('请选择协同 AI'));
        if (modelId.indexOf('plugin:') === 0) {
          var hasVision = false;
          (messagesForAi || []).forEach(function (msg) {
            var c = msg && msg.content;
            if (Array.isArray(c)) {
              c.forEach(function (part) { if (part && part.type === 'image_url') hasVision = true; });
            }
          });
          if (hasVision) return Promise.reject(new Error('插件协同不支持参考图，请改用支持视觉的 API 模型'));
          var pluginId = modelId.replace(/^plugin:/, '');
          return fetch(window.location.origin + '/api/plugin-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pluginId: pluginId, messages: messagesForAi, newMessage: (messagesForAi[messagesForAi.length - 1] || {}).content || '' })
          }).then(function (r) { return r.json(); }).then(function (data) {
            var content = (data.content != null ? data.content : (data.reply || data.text || '')) || (data.error ? '[插件错误: ' + data.error + ']' : '');
            return content;
          });
        }
        var api = getApiForModel(modelId);
        if (!api) return Promise.reject(new Error('协同 AI 未找到对应 API'));
        var modelIdOnly = (modelId.indexOf('::') !== -1) ? modelId.split('::')[1] : modelId;
        if (collabMessagesHaveVisionParts(messagesForAi) && isOllamaLikeApiBase(api.base)) {
          return callOllamaNativeChat(api, modelIdOnly, messagesForAi);
        }
        var ds = applyDashScopeVisionIfNeeded(api.base, modelIdOnly, messagesForAi);
        modelIdOnly = ds.model;
        messagesForAi = ds.messages;
        return fetch(api.base.replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (api.key || '') },
          body: JSON.stringify({ model: modelIdOnly, messages: messagesForAi, stream: false })
        })
          .then(function (res) {
            return res.text().then(function (text) {
              var data = null;
              try { data = text ? JSON.parse(text) : null; } catch (e) {}
              if (!res.ok) {
                var errMsg = res.status + ' ' + res.statusText;
                if (data && data.error) {
                  var er = data.error;
                  errMsg = typeof er === 'string' ? er : ((er.message || er.msg || '') + (er.code ? ' [' + String(er.code) + ']' : '') + (er.param ? ' ' + String(er.param) : '')).trim() || JSON.stringify(er);
                }
                throw new Error(errMsg || '请求失败');
              }
              return data || {};
            });
          })
          .then(function (data) {
            var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : '';
            return content;
          });
      }

      function sendWorkflowChat(mode) {
        var sel = document.getElementById('wfCollabModel');
        var inputEl = document.getElementById('wfChatInput');
        wfState.collabModel = sel ? (sel.value || '') : (wfState.collabModel || '');
        var text = (inputEl ? inputEl.value : '').trim();
        var hasRefs = wfState.refImages && wfState.refImages.length;
        if (!text && !hasRefs) { showApiError('请输入要讨论的内容，或先添加参考图再发送'); return; }
        if (hasRefs && wfState.collabModel.indexOf('plugin:') === 0) {
          showApiError('插件协同不支持参考图，请改用支持视觉的 API 模型。');
          return;
        }
        var userContent = wfCollabUserContentWithRefImages(text, '请结合当前参考图回答。');
        if (userContent == null) { showApiError('请输入要讨论的内容'); return; }
        if (!wfState.collabMessages) wfState.collabMessages = [];
        wfState.collabMessages.push({ role: 'user', content: userContent, ts: Date.now() });
        if (inputEl) inputEl.value = '';
        saveWorkflowState();
        renderWorkflowChatMessages();
        setWorkflowCollabStatus(mode === 'keywords' ? '正在提炼关键词…' : '协同 AI 回复中…');

        var msgs = buildWorkflowCollabApiMessages(mode);
        callCollabAi(wfState.collabModel, msgs)
          .then(function (reply) {
            wfState.collabMessages.push({ role: 'assistant', content: reply || '', name: '协同AI', ts: Date.now() });
            var structured = extractZhiquanStructuredTerms(reply || '');
            if (structured && structured.length) {
              wfState.promptTerms = structured;
              wfState.selectedTerms = {};
              syncRecommendedFromTerms();
            } else if (mode === 'keywords') {
              mergeAssistantTermsIntoState(reply);
            }
            saveWorkflowState();
            setWorkflowCollabStatus('');
            renderWorkflowChatMessages();
            var recEl = document.getElementById('wfRecommendedPrompt');
            if (recEl) recEl.value = wfState.recommendedPrompt || '';
            renderWorkflowKeywords();
          })
          .catch(function (e) {
            setWorkflowCollabStatus('');
            wfState.collabMessages.pop();
            saveWorkflowState();
            renderWorkflowChatMessages();
            showApiError('协同 AI 请求失败：' + (e && e.message ? e.message : e));
          });
      }

      function applySelectedKeywordsToPrompt() {
        var promptEl = document.getElementById('wfPrompt');
        var selected = Object.keys(wfState.selectedTerms || {}).filter(function (k) { return wfState.selectedTerms[k]; });
        if (!selected.length) { showApiError('请先点击选择一些词条'); return; }
        var add = selected.join(', ');
        wfState.prompt = ((promptEl ? promptEl.value : wfState.prompt) || '').trim();
        wfState.prompt = wfState.prompt ? (wfState.prompt + (wfState.prompt.endsWith(',') ? ' ' : '\n') + add) : add;
        wfState.selectedTerms = {};
        saveWorkflowState();
        if (promptEl) promptEl.value = wfState.prompt;
        renderWorkflowKeywords();
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已应用选中词条到提示词');
      }

      function applyRecommendedPromptToPrompt() {
        var promptEl = document.getElementById('wfPrompt');
        var add = ((wfState.promptTerms && wfState.promptTerms.length) ? wfState.promptTerms.join(', ') : (wfState.recommendedPrompt || '')).trim();
        if (!add) { showApiError('暂无 AI 推荐词条，请先让协同 AI 提炼关键词'); return; }
        wfState.prompt = ((promptEl ? promptEl.value : wfState.prompt) || '').trim();
        wfState.prompt = wfState.prompt ? (wfState.prompt + (wfState.prompt.endsWith(',') ? ' ' : '\n') + add) : add;
        saveWorkflowState();
        if (promptEl) promptEl.value = wfState.prompt;
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已应用 AI 推荐提示词');
      }

      function setWorkflowStatus(s) {
        var el = document.getElementById('wfStatus');
        if (el) el.textContent = s || '';
      }

      /** 成功生成一批后：拆分正/反向提示词中的短语并累计次数，便于「常用画风」展示 */
      function recordStylePromptsAfterSuccess(promptText, negativeText) {
        if (!wfState.styleTokenCounts || typeof wfState.styleTokenCounts !== 'object') wfState.styleTokenCounts = {};
        function add(str) {
          if (!str || !String(str).trim()) return;
          var parts = String(str).split(/[,，;；\n]+/);
          var seen = {};
          parts.forEach(function (raw) {
            var p = raw.trim().replace(/\s+/g, ' ');
            if (p.length < 2 || p.length > 120) return;
            if (seen[p]) return;
            seen[p] = 1;
            wfState.styleTokenCounts[p] = (wfState.styleTokenCounts[p] || 0) + 1;
          });
        }
        add(promptText);
        add(negativeText);
        var keys = Object.keys(wfState.styleTokenCounts);
        if (keys.length > 280) {
          keys.sort(function (a, b) { return wfState.styleTokenCounts[a] - wfState.styleTokenCounts[b]; });
          while (keys.length > 200) {
            delete wfState.styleTokenCounts[keys.shift()];
          }
        }
      }

      function appendSnippetToWfPrompt(snippet) {
        var ta = document.getElementById('wfPrompt');
        if (!ta || !snippet) return;
        var v = (ta.value || '').trim();
        ta.value = v ? (v + ', ' + snippet) : snippet;
        wfState.prompt = ta.value;
        saveWorkflowState();
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已插入短语');
      }

      function renderWorkflowStyleUi() {
        var box = document.getElementById('wfStyleTokenChips');
        var list = document.getElementById('wfStylePresetsList');
        if (!wfState.styleTokenCounts) wfState.styleTokenCounts = {};
        var pairs = Object.keys(wfState.styleTokenCounts).map(function (k) {
          return { k: k, n: wfState.styleTokenCounts[k] };
        }).sort(function (a, b) { return b.n - a.n; }).slice(0, 32);
        if (box) {
          if (!pairs.length) {
            box.innerHTML = '<span class="wf-tip">成功生成几批后，这里会出现常用短语（点击插入到上方提示词）。</span>';
          } else {
            box.innerHTML = pairs.map(function (x) {
              return '<span class="wf-chip wf-style-chip" data-ph="' + encodeURIComponent(x.k) + '" title="使用过 ' + x.n + ' 次">' + escapeHtml(x.k) + '<span class="wf-style-n">×' + x.n + '</span></span>';
            }).join('');
            box.querySelectorAll('.wf-style-chip').forEach(function (chip) {
              chip.addEventListener('click', function () {
                var ph = '';
                try { ph = decodeURIComponent(chip.getAttribute('data-ph') || ''); } catch (e) {}
                appendSnippetToWfPrompt(ph);
              });
            });
          }
        }
        if (list) {
          var presets = wfState.stylePresets || [];
          if (!presets.length) {
            list.innerHTML = '<span class="wf-tip">点击「收藏当前为画风」可保存整套正/反向提示词。</span>';
          } else {
            list.innerHTML = presets.map(function (p) {
              return '<div class="wf-preset-row"><span class="wf-preset-name" title="' + escapeHtml((p.prompt || '').slice(0, 160).replace(/"/g, '')) + '">' + escapeHtml(p.name || '未命名') + '</span><span>' +
                '<button type="button" class="btn btn-small" data-preset-id="' + escapeHtml(p.id) + '" data-preset-act="apply">应用</button> ' +
                '<button type="button" class="btn btn-small btn-ghost" data-preset-id="' + escapeHtml(p.id) + '" data-preset-act="del">删除</button></span></div>';
            }).join('');
          }
          if (!list._wfPresetBound) {
            list._wfPresetBound = true;
            list.addEventListener('click', function (e) {
              var btn = e.target.closest('button[data-preset-id]');
              if (!btn) return;
              var id = btn.getAttribute('data-preset-id');
              var act = btn.getAttribute('data-preset-act');
              if (act === 'apply') applyStylePresetById(id);
              else if (act === 'del') deleteStylePresetById(id);
            });
          }
        }
      }

      function applyStylePresetById(id) {
        var presets = wfState.stylePresets || [];
        var p = null;
        for (var i = 0; i < presets.length; i++) {
          if (presets[i].id === id) { p = presets[i]; break; }
        }
        if (!p) return;
        var pe = document.getElementById('wfPrompt');
        var ne = document.getElementById('wfNegative');
        if (pe) pe.value = p.prompt || '';
        if (ne) ne.value = p.negative || '';
        wfState.prompt = p.prompt || '';
        wfState.negative = p.negative || '';
        saveWorkflowState();
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已应用画风：' + (p.name || ''));
      }

      function deleteStylePresetById(id) {
        wfState.stylePresets = (wfState.stylePresets || []).filter(function (p) { return p.id !== id; });
        saveWorkflowState();
        renderWorkflowStyleUi();
      }

      function saveStylePresetUser() {
        var pe = document.getElementById('wfPrompt');
        var ne = document.getElementById('wfNegative');
        var prompt = (pe ? pe.value : wfState.prompt) || '';
        if (!prompt.trim()) { showApiError('请先在「使用的提示词」中填写内容再收藏'); return; }
        var name = window.prompt('画风名称（如：像素主角、Q版立绘）', '');
        if (name === null) return;
        name = (name || '').trim();
        if (!name) { showApiError('未输入名称'); return; }
        if (!wfState.stylePresets) wfState.stylePresets = [];
        wfState.stylePresets.push({
          id: 'sp-' + Date.now(),
          name: name,
          prompt: prompt,
          negative: (ne ? ne.value : wfState.negative) || '',
          createdAt: Date.now()
        });
        saveWorkflowState();
        renderWorkflowStyleUi();
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已保存画风：' + name);
      }

      function clearStyleStatsUser() {
        wfState.styleTokenCounts = {};
        saveWorkflowState();
        renderWorkflowStyleUi();
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已清空短语统计');
      }

      function syncWfPromptFieldsFromDom() {
        var pe = document.getElementById('wfPrompt');
        var ne = document.getElementById('wfNegative');
        if (pe) wfState.prompt = pe.value || '';
        if (ne) wfState.negative = ne.value || '';
      }

      /** 画廊中「收藏」：保存当前图 + 当时提示词/反向，供左侧「满意方案」提取 */
      function addFavoriteFromGallery(idx) {
        syncWfPromptFieldsFromDom();
        if (!wfState.images || !wfState.images[idx]) {
          showApiError('图片已失效，请重新生成后再收藏。');
          return;
        }
        var prompt = (wfState.prompt || '').trim();
        if (!prompt) {
          showApiError('请先填写正向提示词再收藏（会一并保存反向提示词）。');
          return;
        }
        if (!wfState.favoritePrompts) wfState.favoritePrompts = [];
        var img = wfState.images[idx];
        var id = 'fav-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
        var p = wfState.prompt || '';
        var label = p.length > 36 ? p.slice(0, 36) + '…' : p;
        wfState.favoritePrompts.unshift({
          id: id,
          preview: img,
          prompt: p,
          negative: wfState.negative || '',
          label: label,
          savedAt: Date.now()
        });
        var maxFav = 12;
        while (wfState.favoritePrompts.length > maxFav) wfState.favoritePrompts.pop();
        saveWorkflowState();
        renderWorkflowFavorites();
        clearApiError();
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已加入左侧「满意方案」');
        else setWorkflowStatus('已加入满意方案');
      }

      function renderWorkflowFavorites() {
        var box = document.getElementById('wfFavoriteList');
        if (!box) return;
        var list = wfState.favoritePrompts || [];
        if (!list.length) {
          box.innerHTML = '<span class="wf-tip">暂无。生成后在画廊每张卡片上点「收藏」。</span>';
          return;
        }
        box.innerHTML = list.map(function (it) {
          var title = escapeHtml(it.label || (it.prompt || '').slice(0, 40));
          var prev = it.preview || '';
          return '<div class="wf-favorite-row" data-id="' + escapeHtml(it.id) + '">' +
            '<div class="wf-favorite-thumb" title="预览"><img src="' + escapeHtml(prev) + '" alt=""/></div>' +
            '<div class="wf-favorite-body">' +
            '<div class="wf-favorite-title">' + title + '</div>' +
            '<div class="wf-favorite-actions">' +
            '<button type="button" class="btn btn-small btn-ghost wf-fav-fill" data-id="' + escapeHtml(it.id) + '">填入提示词</button>' +
            '<button type="button" class="btn btn-small btn-ghost wf-fav-ref" data-id="' + escapeHtml(it.id) + '">作参考图</button>' +
            '<button type="button" class="btn btn-small btn-ghost wf-fav-del" data-id="' + escapeHtml(it.id) + '">删除</button>' +
            '</div></div></div>';
        }).join('');
        box.querySelectorAll('.wf-fav-fill').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            applyFavoriteToPrompts(btn.getAttribute('data-id'));
          });
        });
        box.querySelectorAll('.wf-fav-ref').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            addFavoritePreviewAsRef(btn.getAttribute('data-id'));
          });
        });
        box.querySelectorAll('.wf-fav-del').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            removeFavoritePrompt(btn.getAttribute('data-id'));
          });
        });
      }

      function applyFavoriteToPrompts(id) {
        var it = (wfState.favoritePrompts || []).find(function (x) { return x && x.id === id; });
        if (!it) return;
        var pe = document.getElementById('wfPrompt');
        var ne = document.getElementById('wfNegative');
        if (pe) pe.value = it.prompt || '';
        if (ne) ne.value = it.negative || '';
        wfState.prompt = it.prompt || '';
        wfState.negative = it.negative || '';
        saveWorkflowState();
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已填入提示词，可继续拓展该角色');
        else setWorkflowStatus('已填入提示词');
      }

      function addFavoritePreviewAsRef(id) {
        var it = (wfState.favoritePrompts || []).find(function (x) { return x && x.id === id; });
        if (!it || !it.preview) return;
        if (!wfState.refImages) wfState.refImages = [];
        if (wfState.refImages.length >= 2) wfState.refImages.shift();
        wfState.refImages.push({
          id: 'ref-fav-' + Date.now(),
          name: '满意方案',
          dataUrl: it.preview
        });
        saveWorkflowState();
        renderWorkflowRefPanel();
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已加入参考图（上方参考图区）');
        else setWorkflowStatus('已加入参考图');
      }

      function removeFavoritePrompt(id) {
        wfState.favoritePrompts = (wfState.favoritePrompts || []).filter(function (x) { return x && x.id !== id; });
        saveWorkflowState();
        renderWorkflowFavorites();
      }

      function renderWorkflowGallery() {
        var g = document.getElementById('wfGallery');
        if (!g) return;
        var imgs = wfState.images || [];
        if (!imgs.length) {
          g.innerHTML = '<div class="wf-tip">暂无图片。点击「生成一批」开始抽卡。</div>';
          return;
        }
        g.innerHTML = imgs.map(function (src, idx) {
          var sel = (idx === wfState.selected) ? ' selected' : '';
          return '<div class="wf-card' + sel + '" data-idx="' + idx + '"><img src="' + escapeHtml(src) + '" alt="wf-' + idx + '"/><div class="wf-card-meta"><span>#' + (idx + 1) + ' ' + (idx === wfState.selected ? '已选中' : '点击选中') + '</span><button type="button" class="btn btn-small btn-ghost wf-fav-btn" data-idx="' + idx + '" title="收藏本图与当前提示词到左侧">收藏</button></div></div>';
        }).join('');
        g.querySelectorAll('.wf-card').forEach(function (card) {
          card.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('.wf-fav-btn')) return;
            var idx = parseInt(card.getAttribute('data-idx'), 10);
            wfState.selected = isNaN(idx) ? -1 : idx;
            saveWorkflowState();
            renderWorkflowGallery();
          });
        });
        g.querySelectorAll('.wf-fav-btn').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var idx = parseInt(btn.getAttribute('data-idx'), 10);
            if (!isNaN(idx)) addFavoriteFromGallery(idx);
          });
        });
      }

      function renderWorkflowSavedStrip() {
        var strip = document.getElementById('wfSavedStrip');
        var tip = document.getElementById('wfRefTip');
        if (!strip) return;
        var items = wfState.saved || [];
        if (!items.length) {
          strip.innerHTML = '<span class="wf-tip">暂无已保存图片</span>';
          if (tip) tip.textContent = '';
          return;
        }
        strip.innerHTML = items.map(function (it, idx) {
          var src = it && (it.preview || it.src) ? (it.preview || it.src) : '';
          var sel = (idx === wfState.refIndex) ? ' selected' : '';
          return '<div class="wf-saved-item' + sel + '" data-idx="' + idx + '" title="点击设为参考（再次点击取消）"><img src="' + escapeHtml(src) + '" alt="saved-' + idx + '"/></div>';
        }).join('');
        strip.querySelectorAll('.wf-saved-item').forEach(function (el) {
          el.addEventListener('click', function () {
            var idx = parseInt(el.getAttribute('data-idx'), 10);
            if (isNaN(idx)) return;
            wfState.refIndex = (wfState.refIndex === idx) ? -1 : idx;
            saveWorkflowState();
            renderWorkflowSavedStrip();
          });
        });
        if (tip) {
          if (wfState.refIndex >= 0 && items[wfState.refIndex]) {
            var p = items[wfState.refIndex].path ? ('参考：' + items[wfState.refIndex].path) : '参考已选中';
            tip.textContent = p;
          } else tip.textContent = '';
        }
      }

      function getWorkflowApi() {
        var conv = getCurrentConversation();
        if (!conv || !conv.model) return null;
        if (conv.model.indexOf('plugin:') === 0) return null;
        return getApiForModel(conv.model);
      }

      function generateWorkflowBatch() {
        clearApiError();
        refreshWorkflowComfyHint();
        ensureImageApiAvailable(function () {
          var promptEl = document.getElementById('wfPrompt');
          var negEl = document.getElementById('wfNegative');
          var batchEl = document.getElementById('wfBatchSize');
          var sizeEl = document.getElementById('wfSize');
          var modelEl = document.getElementById('wfImageModel');
          var subdirEl = document.getElementById('wfSaveSubdir');
          var genBackEl = document.getElementById('wfGenBackend');
          var comfyBaseEl = document.getElementById('wfComfyuiBase');
          wfState.genBackend = genBackEl ? (genBackEl.value || 'comfyui') : (wfState.genBackend || 'comfyui');
          wfState.comfyuiBase = (comfyBaseEl && comfyBaseEl.value.trim()) ? comfyBaseEl.value.trim() : (wfState.comfyuiBase || 'http://127.0.0.1:8188');
          wfState.prompt = (promptEl ? promptEl.value : wfState.prompt) || '';
          wfState.negative = (negEl ? negEl.value : wfState.negative) || '';
          wfState.batchSize = parseInt(batchEl ? batchEl.value : wfState.batchSize, 10) || 8;
          wfState.size = (sizeEl ? sizeEl.value : wfState.size) || '512x512';
          wfState.imageModel = (modelEl ? modelEl.value : wfState.imageModel) || 'dall-e-3';
          wfState.saveSubdir = (subdirEl ? subdirEl.value : wfState.saveSubdir) || 'pixel';
          wfState.images = [];
          wfState.selected = -1;
          saveWorkflowState();
          renderWorkflowGallery();

          if (!wfState.prompt.trim()) { showApiError('请先填写提示词再生成。'); return; }

          if (wfState.genBackend === 'comfyui') {
            var wh = (wfState.size || '512x512').toLowerCase().split('x');
            var w = parseInt(wh[0], 10) || 512;
            var h = parseInt(wh[1], 10) || 512;
            setWorkflowStatus('ComfyUI 正在生成 ' + wfState.batchSize + ' 张…');
            fetch(window.location.origin + '/api/comfyui-generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                comfyui_base: wfState.comfyuiBase,
                prompt: wfState.prompt,
                negative: wfState.negative || '',
                width: w,
                height: h,
                batch_size: wfState.batchSize,
                seed: -1
              })
            })
              .then(function (res) {
                return res.text().then(function (text) {
                  var data = null;
                  try { data = text ? JSON.parse(text) : null; } catch (e) {}
                  if (!res.ok) {
                    var errMsg = (data && data.error) ? data.error : (text || (res.status + ' ' + res.statusText));
                    throw new Error(errMsg);
                  }
                  return data || {};
                });
              })
              .then(function (data) {
                if (data && data.error) throw new Error(data.error);
                var arr = (data && data.data && Array.isArray(data.data)) ? data.data : [];
                wfState.images = arr.map(function (item) {
                  return item && (item.url || (item.b64_json ? ('data:image/png;base64,' + item.b64_json) : ''));
                }).filter(function (x) { return !!x; });
                if (!wfState.images.length) throw new Error('未返回图片');
                wfState.selected = 0;
                saveWorkflowState();
                clearApiError();
                recordStylePromptsAfterSuccess(wfState.prompt, wfState.negative);
                saveWorkflowState();
                renderWorkflowStyleUi();
                setWorkflowStatus('生成完成：' + wfState.images.length + ' 张。点击选择后保存。');
                renderWorkflowGallery();
                markImageGenBackendReadyAndHideUi();
              })
              .catch(function (err) {
                setWorkflowStatus('');
                showApiError((err && err.message) || 'ComfyUI 生成失败。请确认 ComfyUI 已启动，且已放置 zhiquan_workspace/comfyui_api_workflow.json（见 docs/17-ComfyUI抽卡接入.md）。');
              });
            return;
          }

          var api = getWorkflowApi();
          if (!api) { showApiError('图片生成需要选择一个 API 模型（非插件）。请先回到对话区选择模型。'); return; }
          var fullPrompt = wfState.prompt;
          if (wfState.negative && wfState.negative.trim()) {
            fullPrompt += '\n\nNegative prompt: ' + wfState.negative.trim();
          }
          var base = (api.base || '').replace(/\/+$/, '');
          var url = base + '/images/generations';
          setWorkflowStatus('正在生成 ' + wfState.batchSize + ' 张…');
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (api.key || '') },
            body: JSON.stringify({ model: wfState.imageModel, prompt: fullPrompt, n: wfState.batchSize, size: wfState.size })
          })
            .then(function (res) { return res.text().then(function (t) { return { ok: res.ok, text: t }; }); })
            .then(function (r) {
              var data = null;
              try { data = r.text ? JSON.parse(r.text) : null; } catch (e) {}
              if (!r.ok) {
                var msg = (data && data.error && data.error.message) ? data.error.message : (r.text || '请求失败');
                throw new Error(msg);
              }
              var arr = (data && data.data && Array.isArray(data.data)) ? data.data : [];
              wfState.images = arr.map(function (item) {
                return item && (item.url || (item.b64_json ? ('data:image/png;base64,' + item.b64_json) : ''));
              }).filter(function (x) { return !!x; });
              if (!wfState.images.length) throw new Error('未返回图片（该 API 可能不支持 n>1 或不支持 /images/generations）');
              wfState.selected = 0;
              saveWorkflowState();
              clearApiError();
              recordStylePromptsAfterSuccess(wfState.prompt, wfState.negative);
              saveWorkflowState();
              renderWorkflowStyleUi();
              setWorkflowStatus('生成完成：' + wfState.images.length + ' 张。点击选择后保存。');
              renderWorkflowGallery();
              markImageGenBackendReadyAndHideUi();
            })
            .catch(function (err) {
              setWorkflowStatus('');
              showApiError((err && err.message) || '生成失败。若该 API 不支持批量 n>1，可改为 4 张或 1 张；或更换支持图片生成的后端。');
            });
        });
      }

      /** 将本次保存的图片与提示词写入当前对话标签页，便于在「对话」中回看历史 */
      function appendWorkflowSaveToCurrentConversation(img, savedPath, prompt, negative) {
        var conv = getCurrentConversation();
        if (!conv || !conv.messages) return;
        var pathLine = savedPath || '(未知路径)';
        var userText = '[图片生成] 已保存到工作区：' + pathLine;
        if (prompt) userText += '\n\n提示词：\n' + prompt;
        if (negative && String(negative).trim()) userText += '\n\n反向：\n' + String(negative).trim();
        conv.messages.push({ role: 'user', content: userText });
        conv.messages.push({
          role: 'assistant',
          content: img,
          isImage: true,
          speaker: APP_NAME + '·图片生成',
          modelId: 'workflow',
          workflowPath: pathLine
        });
        saveState();
        if (mainView === 'chat') renderMessages(conv.messages);
      }

      /** 将协同讨论区可见记录写入当前对话（不含内部 system 提示） */
      function syncWorkflowCollabToCurrentConversation() {
        var conv = getCurrentConversation();
        if (!conv || !conv.messages) {
          showApiError('暂无当前对话，请先打开或新建一个对话标签页。');
          return;
        }
        var visible = (wfState.collabMessages || []).filter(function (m) { return !m.internal; });
        if (!visible.length) {
          showApiError('暂无协同讨论可同步，请先在讨论区发送几条消息。');
          return;
        }
        var lines = visible.map(function (m) {
          var who = m.role === 'user' ? '你' : (m.name || '协同AI');
          return '【' + who + '】\n' + wfCollabMessageBubbleText(m);
        });
        var text = '【图片生成 · 协同讨论备份】\n\n' + lines.join('\n\n---\n\n');
        conv.messages.push({ role: 'user', content: text });
        saveState();
        if (mainView === 'chat') {
          renderMessages(conv.messages);
        } else {
          setWorkflowStatus('协同讨论已写入当前对话标签页，点左上角返回对话即可查看。');
          if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已同步到当前对话');
        }
      }

      function saveSelectedWorkflowImageAndNext() {
        var idx = wfState.selected;
        if (idx == null || idx < 0 || !wfState.images || !wfState.images[idx]) {
          showApiError('请先在画廊中选中一张图片再保存。');
          return;
        }
        var img = wfState.images[idx];
        var subdirEl = document.getElementById('wfSaveSubdir');
        wfState.saveSubdir = (subdirEl ? subdirEl.value : wfState.saveSubdir) || 'pixel';
        saveWorkflowState();
        setWorkflowStatus('正在保存到 assets/…（保存后会显示在顶部参考栏）');
        var filename = 'pixel_' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
        fetch(window.location.origin + '/api/save-asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: img, filename: filename, subdir: wfState.saveSubdir })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data || !data.ok) throw new Error((data && data.error) || '保存失败');
            if (!wfState.saved) wfState.saved = [];
            wfState.saved.unshift({ src: img, preview: img, path: data.path || filename, savedAt: Date.now(), prompt: wfState.prompt || '' });
            wfState.refIndex = 0;
            saveWorkflowState();
            renderWorkflowSavedStrip();
            appendWorkflowSaveToCurrentConversation(img, data.path || filename, wfState.prompt || '', wfState.negative || '');
            setWorkflowStatus('已保存：' + (data.path || filename) + '。已记入当前对话；正在下一批…');
            generateWorkflowBatch();
          })
          .catch(function (e) {
            setWorkflowStatus('');
            showApiError('保存失败：' + (e && e.message ? e.message : e));
          });
      }

      function runMeetingRound(conv, index, sendBtn) {
        if (index >= conv.meetingOrder.length) {
          hideThinking();
          sendBtn.disabled = false;
          return;
        }
        var participant = conv.meetingOrder[index];
        var participantName = participant.name || participant.modelId || 'AI';
        showThinking(participantName);
        var api = getApiForModel(participant.modelId);
        if (!api) {
          showApiError('参会 AI「' + (participant.name || participant.modelId) + '」未找到对应 API。');
          sendBtn.disabled = false;
          return;
        }
        var modelIdOnly = (participant.modelId.indexOf('::') !== -1) ? participant.modelId.split('::')[1] : participant.modelId;
        var meetingSystemPrompt = '【会议模式说明】当前这是一场多方会议对话，你并非在与用户一对一交流。你是参会者之一。你的身份/名称：' + (participant.name || participant.modelId) + '，模型标识：' + modelIdOnly + '。请根据上文其他 AI 与用户的讨论，按你的身份简要发言。';
        var messagesForApi = [{ role: 'system', content: meetingSystemPrompt }].concat(conv.messages.map(function (m) {
          var content = m.content;
          if (m.role === 'assistant' && m.speaker && typeof content === 'string') {
            content = '【' + m.speaker + (m.modelId ? ' · ' + m.modelId : '') + '】\n' + (content || '');
          }
          if (content === undefined) content = '';
          return { role: m.role, content: content };
        }));
        var dsMeet = applyDashScopeVisionIfNeeded(api.base, modelIdOnly, messagesForApi);
        modelIdOnly = dsMeet.model;
        messagesForApi = dsMeet.messages;
        fetch(api.base + '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + api.key
          },
          body: JSON.stringify({
            model: modelIdOnly,
            messages: messagesForApi,
            stream: false
          })
        })
          .then(function (res) {
            return res.text().then(function (text) {
              var data = null;
              try { data = text ? JSON.parse(text) : null; } catch (e) {}
              if (!res.ok) {
                var msg = (data && data.error && data.error.message) ? data.error.message : (res.status + ' ' + res.statusText);
                throw new Error(msg);
              }
              return data || {};
            });
          })
          .then(function (data) {
            hideThinking();
            var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : '';
            conv.messages.push({ role: 'assistant', content: content, speaker: participant.name || participant.modelId, modelId: participant.modelId, usage: extractTokenUsage(data) });
            saveState();
            renderMessages(conv.messages);
            runMeetingRound(conv, index + 1, sendBtn);
          })
          .catch(function (err) {
            hideThinking();
            conv.messages.push({ role: 'assistant', content: '[请求失败: ' + (err.message || '') + ']', speaker: participant.name || participant.modelId, modelId: participant.modelId });
            saveState();
            renderMessages(conv.messages);
            showApiError(err.message || '请求失败');
            runMeetingRound(conv, index + 1, sendBtn);
          });
      }

      var refreshPageBtn = document.getElementById('refreshPageBtn');
      if (refreshPageBtn) refreshPageBtn.addEventListener('click', function () { location.reload(true); });

      function updateModelListHint() {
        var el = document.getElementById('modelListHint');
        if (!el) return;
        if (!modelList.length) {
          el.style.display = 'none';
          el.textContent = '';
          return;
        }
        el.textContent = '以下模型按接入的 API 单独列出，每个分组对应一个已保存的 API。';
        el.style.display = 'block';
      }

      function applyModelListFromApi(list) {
        modelList = (list && list.length) ? list.map(function (m) { return { id: m.id, name: m.id, modelId: m.id, apiId: '', apiName: '', apiBase: '', apiKey: '' }; }) : [];
        var conv = getCurrentConversation();
        var needFix = false;
        var firstId = (modelList[0] && modelList[0].id) || '';
        conversations.forEach(function (c) {
          if (!modelList.find(function (m) { return m.id === c.model; })) {
            c.model = firstId;
            needFix = true;
          }
        });
        if (needFix) saveState();
        renderTabs();
        fillModelSelect(conv ? conv.model : firstId);
        if (conv) renderMessages(conv.messages);
        updateModelListHint();
        renderWorkflowCollabOptions();
      }

      function fetchModelsFromApis() {
        modelList = [];
        if (!apis.length) {
          setModelsUnavailable();
          return;
        }
        var conv = getCurrentConversation();
        var done = 0;
        apis.forEach(function (api) {
          var base = (api.base && api.base.trim()) ? api.base.trim().replace(/\/+$/, '') : defaultBase;
          var key = (api.key && api.key.trim()) || 'sk-1234';
          fetch(base + '/models', { headers: { 'Authorization': 'Bearer ' + key } })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              var pushed = 0;
              var rows = (data && data.data && Array.isArray(data.data)) ? data.data : [];
              rows.forEach(function (m) {
                var mid = (m.id || '').trim();
                if (!mid) return;
                if (isDashScopeApiBase(base) && !isDashScopeUiModelId(mid)) return;
                modelList.push({
                  id: api.id + '::' + mid,
                  modelId: mid,
                  apiId: api.id,
                  apiName: api.name || api.id,
                  apiBase: base,
                  apiKey: key,
                  name: (api.name || api.id) + ' · ' + mid
                });
                pushed++;
              });
              appendDashScopeFallbackModelsIfEmpty(api, base, key, pushed);
              done++;
              if (done >= apis.length) finishFetchModels();
            })
            .catch(function () {
              appendDashScopeFallbackModelsIfEmpty(api, base, key, 0);
              done++;
              if (done >= apis.length) finishFetchModels();
            });
        });
        function finishFetchModels() {
          var needFix = false;
          var firstId = (modelList[0] && modelList[0].id) || '';
          conversations.forEach(function (c) {
            if (!modelList.find(function (m) { return m.id === c.model; })) {
              c.model = firstId;
              needFix = true;
            }
          });
          if (needFix) saveState();
          renderTabs();
          fillModelSelect(conv ? conv.model : firstId);
          if (conv) renderMessages(conv.messages);
          updateModelListHint();
          renderWorkflowCollabOptions();
          clearBackendHint();
          if (!modelList.length) showBackendHint();
        }
      }

      function openApiQuickSetup() {
        var overlay = document.getElementById('apiQuickSetupOverlay');
        var nameEl = document.getElementById('apiQuickName');
        var baseEl = document.getElementById('apiQuickBase');
        var keyEl = document.getElementById('apiQuickKey');
        if (!overlay) return;
        if (nameEl && !nameEl.value) nameEl.value = '默认';
        if (baseEl && !baseEl.value) baseEl.value = defaultBase;
        if (keyEl && !keyEl.value) keyEl.value = '';
        overlay.style.display = 'flex';
      }

      function closeApiQuickSetup() {
        var overlay = document.getElementById('apiQuickSetupOverlay');
        if (overlay) overlay.style.display = 'none';
      }

      function getWfGenBackend() {
        var sel = document.getElementById('wfGenBackend');
        return sel ? (sel.value || 'comfyui') : (wfState.genBackend || 'comfyui');
      }

      function ensureImageApiAvailable(onReady) {
        wfState.genBackend = getWfGenBackend();
        saveWorkflowState();
        if (wfState.genBackend === 'comfyui') {
          if (onReady) onReady();
          return;
        }
        if (apis && apis.length && modelList && modelList.length) { if (onReady) onReady(); return; }
        openApiQuickSetup();
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('请先配置可用 API');
      }

      /** 从 ComfyUI 控制台/终端整段文本中解析可访问的 Base URL（供浏览器与本机「OVO」调用） */
      function parseComfyuiBaseFromConsole(text) {
        if (!text || typeof text !== 'string') return null;
        var t = text.replace(/\r\n/g, '\n').replace(/\u001b\[[0-9;]*m/g, '');
        function normalizeUrl(u) {
          if (!u) return null;
          u = u.trim().replace(/[.,;)\]'"\s]+$/g, '');
          if (u.indexOf('http://') !== 0 && u.indexOf('https://') !== 0) return null;
          u = u.replace(/\/+$/, '');
          u = u.replace(/^http:\/\/0\.0\.0\.0(?=:|\/)/, 'http://127.0.0.1');
          u = u.replace(/^https:\/\/0\.0\.0\.0(?=:|\/)/, 'https://127.0.0.1');
          return u;
        }
        var lineRe = /(?:To see the GUI\s+(?:\w+\s+)?go to:\s*|Starting server|Server started|HTTP server|GUI at|Open (?:the |your )?browser|浏览.*?:\s*)(https?:\/\/[^\s\)'"]+)/i;
        var lines = t.split('\n');
        var i;
        for (i = 0; i < lines.length; i++) {
          var lm = lines[i].match(lineRe);
          if (lm && lm[1]) {
            var n1 = normalizeUrl(lm[1]);
            if (n1) return n1;
          }
        }
        var allUrls = t.match(/https?:\/\/[^\s\)'"]+/gi) || [];
        var fallback = null;
        for (i = 0; i < allUrls.length; i++) {
          var n2 = normalizeUrl(allUrls[i]);
          if (!n2) continue;
          if (/8188/.test(n2)) return n2;
          if (!fallback) fallback = n2;
        }
        if (fallback) return fallback;
        var hp = t.match(/\b(?:https?:\/\/)?(127\.0\.0\.1|localhost|0\.0\.0\.0):(\d{2,5})\b/);
        if (hp) {
          var h = hp[1] === '0.0.0.0' ? '127.0.0.1' : hp[1];
          return 'http://' + h + ':' + hp[2];
        }
        return null;
      }

      function applyComfyuiConsolePaste() {
        var ta = document.getElementById('wfComfyConsolePaste');
        var inp = document.getElementById('wfComfyuiBase');
        var genSel = document.getElementById('wfGenBackend');
        var raw = (ta && ta.value) ? ta.value : '';
        if (!String(raw).trim()) {
          showApiError('请先粘贴 ComfyUI 控制台或终端里的启动日志。');
          return;
        }
        var url = parseComfyuiBaseFromConsole(raw);
        if (!url) {
          showApiError('未能识别地址。请确认日志中含有 http://… 或 127.0.0.1:端口（常见为 8188）。');
          return;
        }
        wfState.comfyuiBase = url;
        if (inp) inp.value = url;
        if (genSel) genSel.value = 'comfyui';
        wfState.genBackend = 'comfyui';
        saveWorkflowState();
        refreshWorkflowComfyHint();
        clearApiError();
        if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已保存 ComfyUI 地址：' + url);
        else {
          var st = document.getElementById('wfStatus');
          if (st) st.textContent = '已保存 ComfyUI 地址：' + url;
        }
      }

      /** ComfyUI 模式：检测 API 工作流文件；统一用 #wfError 显示，避免与报错区重复两条提示 */
      function refreshWorkflowComfyHint() {
        var wfErr = document.getElementById('wfError');
        var genBack = document.getElementById('wfGenBackend');
        if (!wfErr) return;
        if (!genBack || genBack.value !== 'comfyui') {
          if (wfErr.getAttribute('data-wf-hint') === '1') {
            wfErr.style.display = 'none';
            wfErr.textContent = '';
            wfErr.removeAttribute('data-wf-hint');
            wfErr.classList.remove('wf-warn');
          }
          return;
        }
        fetch(window.location.origin + '/api/comfyui-workflow-status')
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.workflow_file_exists) {
              if (wfErr.getAttribute('data-wf-hint') === '1') {
                wfErr.style.display = 'none';
                wfErr.textContent = '';
                wfErr.removeAttribute('data-wf-hint');
                wfErr.classList.remove('wf-warn', 'wf-err');
              }
            } else {
              wfErr.setAttribute('data-wf-hint', '1');
              wfErr.classList.remove('wf-err');
              wfErr.classList.add('wf-warn');
              wfErr.style.display = 'block';
              wfErr.textContent = '未检测到 zhiquan_workspace/comfyui_api_workflow.json，ComfyUI 无法出图。请在 ComfyUI 中 Save (API Format) 后复制到该路径，或用 scripts/install_comfyui_api_workflow.py 从浏览器 Network 安装。详见 docs/17。';
            }
          })
          .catch(function () {
            if (wfErr.getAttribute('data-wf-hint') === '1') {
              wfErr.style.display = 'none';
              wfErr.textContent = '';
              wfErr.removeAttribute('data-wf-hint');
            }
          });
      }

      function setModelsUnavailable() {
        modelList = [];
        conversations.forEach(function (c) { c.model = ''; });
        saveState();
        renderTabs();
        fillModelSelect('');
        updateModelListHint();
        renderWorkflowCollabOptions();
        var conv = getCurrentConversation();
        if (conv) renderMessages(conv.messages);
      }

      function applyApiConfig(apiBase, apiKey) {
        if (apiBase != null && apiBase !== '') {
          API_BASE = apiBase.replace(/\/+$/, '');
          localStorage.setItem(API_BASE_KEY, API_BASE);
        }
        if (apiKey != null && apiKey !== '') {
          API_KEY = apiKey;
          localStorage.setItem(API_KEY_STORAGE_KEY, API_KEY);
        }
        var baseEl = document.getElementById('apiBaseInput');
        var keyEl = document.getElementById('apiKeyInput');
        if (baseEl && apiBase != null) baseEl.value = apiBase;
        if (keyEl && apiKey != null) keyEl.value = apiKey;
      }

      function renderApiList() {
        var container = document.getElementById('apiListContainer');
        if (!container) return;
        if (!apis.length) {
          container.innerHTML = '<p class="api-panel-desc" style="margin-top:0;">暂无 API，点击下方「添加 API」。</p>';
          return;
        }
        container.innerHTML = apis.map(function (api, i) {
          var id = api.id || ('api-' + i);
          return '<div class="api-card" data-id="' + escapeHtml(id) + '">' +
            '<div class="api-card-head"><input type="text" class="api-name" placeholder="名称（如智谱、DeepSeek）" value="' + escapeHtml(api.name || '') + '" /><button type="button" class="api-card-del">删除</button></div>' +
            '<label>API 地址（留空则用本机代理）</label><input type="text" class="api-base" placeholder="https://api.xxx.com/v1" value="' + escapeHtml(api.base || '') + '" />' +
            '<label>API Key</label><input type="password" class="api-key" placeholder="可选" value="' + escapeHtml(api.key || '') + '" autocomplete="off" />' +
            '</div>';
        }).join('');
        container.querySelectorAll('.api-card-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var card = btn.closest('.api-card');
            var id = card && card.getAttribute('data-id');
            if (id) apis = apis.filter(function (a) { return a.id !== id; });
            renderApiList();
          });
        });
      }

      function collectApisFromCards() {
        var cards = document.querySelectorAll('#apiListContainer .api-card');
        var list = [];
        cards.forEach(function (card, i) {
          var id = card.getAttribute('data-id') || ('api-' + i);
          var name = (card.querySelector('.api-name') && card.querySelector('.api-name').value) || ('API ' + (i + 1));
          var base = card.querySelector('.api-base') && card.querySelector('.api-base').value;
          var key = card.querySelector('.api-key') && card.querySelector('.api-key').value;
          list.push({ id: id, name: name.trim() || ('API ' + (i + 1)), base: base ? base.trim() : '', key: key ? key.trim() : '' });
        });
        return list;
      }

      function renderPluginList() {
        var container = document.getElementById('pluginListContainer');
        if (!container) return;
        var editable = plugins.filter(function (p) { return !p.builtin; });
        if (!editable.length) {
          container.innerHTML = '<p class="api-panel-desc" style="margin-top:0;">暂无其他插件。Cursor 已作为内置插件在上方书签中；点击「+ 添加插件」接入更多。</p>';
          renderPluginBookmarks();
          fillModelSelect(getCurrentConversation() ? getCurrentConversation().model : '');
          renderWorkflowCollabOptions();
          return;
        }
        container.innerHTML = editable.map(function (pl, i) {
          var id = pl.id || ('plugin-' + i);
          return '<div class="plugin-card api-card" data-id="' + escapeHtml(id) + '">' +
            '<div class="api-card-head"><input type="text" class="plugin-name api-name" placeholder="名称（如自建助手）" value="' + escapeHtml(pl.name || '') + '" /><button type="button" class="api-card-del plugin-del">删除</button></div>' +
            '<label>插件地址（接收 POST /chat，见文档）</label><input type="text" class="plugin-endpoint" placeholder="http://localhost:端口 或 https://..." value="' + escapeHtml(pl.endpoint || '') + '" />' +
            '<label>API Key（可选）</label><input type="password" class="plugin-key api-key" placeholder="可选" value="' + escapeHtml(pl.apiKey || '') + '" autocomplete="off" />' +
            '</div>';
        }).join('');
        container.querySelectorAll('.plugin-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var card = btn.closest('.plugin-card');
            var id = card && card.getAttribute('data-id');
            if (id) plugins = plugins.filter(function (p) { return p.id !== id; });
            renderPluginList();
            fillModelSelect(getCurrentConversation() ? getCurrentConversation().model : '');
            renderWorkflowCollabOptions();
          });
        });
        renderPluginBookmarks();
        fillModelSelect(getCurrentConversation() ? getCurrentConversation().model : '');
        renderWorkflowCollabOptions();
      }

      function collectPluginsFromCards() {
        var cards = document.querySelectorAll('#pluginListContainer .plugin-card');
        var list = [];
        cards.forEach(function (card, i) {
          var id = card.getAttribute('data-id') || ('plugin-' + i);
          var name = (card.querySelector('.plugin-name') && card.querySelector('.plugin-name').value) || ('插件 ' + (i + 1));
          var endpoint = card.querySelector('.plugin-endpoint') && card.querySelector('.plugin-endpoint').value;
          var key = card.querySelector('.plugin-key') && card.querySelector('.plugin-key').value;
          list.push({ id: id, name: name.trim() || ('插件 ' + (i + 1)), endpoint: endpoint ? endpoint.trim() : '', apiKey: key ? key.trim() : '' });
        });
        return list;
      }

      function initApiPanel() {
        var saveBtn = document.getElementById('apiSaveBtn');
        var addBtn = document.getElementById('addApiBtn');
        var tipEl = document.getElementById('apiSavedTip');
        fetch(window.location.origin + '/api/local-config')
          .then(function (r) { return r.ok ? r.json() : {}; })
          .then(function (data) {
            if (data.apis && data.apis.length) {
              apis = data.apis.map(function (a) { return { id: a.id, name: a.name || a.id, base: a.base || '', key: a.key || '' }; });
            } else if (data.apiBase != null || data.apiKey != null) {
              apis = [{ id: 'default', name: '默认', base: data.apiBase || '', key: data.apiKey || '' }];
            }
            plugins = (data.plugins || []).map(function (p) { return { id: p.id, name: p.name || p.id, endpoint: p.endpoint || '', apiKey: p.apiKey || '' }; });
            injectCursorPlugin();
            renderApiList();
            renderPluginList();
            renderTabs();
            var conv = getCurrentConversation();
            if (conv) {
              fillModelSelect(conv.model);
              renderMessages(conv.messages);
              updateMeetingPanelVisibility();
              if (conv.meetingOrder) renderMeetingOrderList();
            }
            fetchModelsFromApis();
          })
          .catch(function () {
            injectCursorPlugin();
            renderApiList();
            renderPluginList();
            renderTabs();
            var conv = getCurrentConversation();
            if (conv) { fillModelSelect(conv.model); renderMessages(conv.messages); updateMeetingPanelVisibility(); if (conv.meetingOrder) renderMeetingOrderList(); }
            setModelsUnavailable();
            showBackendHint();
          });
        if (document.getElementById('addPluginBtn')) {
          document.getElementById('addPluginBtn').onclick = function () {
            var id = 'plugin-' + Date.now();
            plugins.push({ id: id, name: '', endpoint: '', apiKey: '' });
            renderPluginList();
            var card = document.querySelector('.plugin-card[data-id="' + id + '"]');
            if (card && card.querySelector('.plugin-name')) card.querySelector('.plugin-name').focus();
          };
        }
        if (document.getElementById('pluginSaveBtn')) {
          document.getElementById('pluginSaveBtn').onclick = function () {
            var list = collectPluginsFromCards();
            fetch(window.location.origin + '/api/local-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ plugins: list })
            })
              .then(function (r) { return r.json(); })
              .then(function () {
                plugins = list;
                injectCursorPlugin();
                fillModelSelect(getCurrentConversation() ? getCurrentConversation().model : '');
                renderWorkflowCollabOptions();
                renderPluginBookmarks();
                var tip = document.getElementById('pluginSavedTip');
                if (tip) { tip.style.display = 'block'; tip.textContent = '已保存'; setTimeout(function () { tip.style.display = 'none'; }, 2000); }
              })
              .catch(function () {
                var tip = document.getElementById('pluginSavedTip');
                if (tip) { tip.style.display = 'block'; tip.textContent = '保存失败'; tip.style.color = '#e94560'; setTimeout(function () { tip.style.display = 'none'; tip.style.color = ''; }, 2000); }
              });
          };
        }
        if (addBtn) {
          addBtn.addEventListener('click', function () {
            var id = 'api-' + Date.now();
            apis.push({ id: id, name: '', base: '', key: '' });
            renderApiList();
            var card = document.querySelector('.api-card[data-id="' + id + '"]');
            if (card && card.querySelector('.api-name')) card.querySelector('.api-name').focus();
          });
        }
        if (saveBtn) {
          saveBtn.addEventListener('click', function () {
            apis = collectApisFromCards();
            fetch(window.location.origin + '/api/local-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apis: apis })
            })
              .then(function (r) { return r.json(); })
              .then(function () {
                if (tipEl) { tipEl.style.display = 'block'; tipEl.textContent = '已保存，正在刷新模型列表…'; setTimeout(function () { tipEl.style.display = 'none'; }, 2500); }
                fetchModelsFromApis();
                if (tipEl) setTimeout(function () { tipEl.textContent = '模型列表已更新'; }, 1500);
              })
              .catch(function () {
                if (tipEl) { tipEl.style.display = 'block'; tipEl.textContent = '保存失败'; tipEl.style.color = '#e94560'; setTimeout(function () { tipEl.style.display = 'none'; tipEl.style.color = ''; }, 2000); }
              });
          });
        }
      }

      function showApiPage() {
        var apiPage = document.getElementById('apiPageView');
        var chatView = document.getElementById('chatView');
        var wfView = document.getElementById('workflowView');
        var btn = document.getElementById('apiStorageBtn');
        if (apiPage) apiPage.classList.add('show');
        if (chatView) chatView.classList.add('hide');
        if (wfView) wfView.classList.remove('show');
        if (btn) btn.classList.add('active');
      }
      function showChatView() {
        var apiPage = document.getElementById('apiPageView');
        var chatView = document.getElementById('chatView');
        var wfView = document.getElementById('workflowView');
        var btn = document.getElementById('apiStorageBtn');
        var sidebar = document.getElementById('sidebar');
        if (apiPage) apiPage.classList.remove('show');
        if (chatView) chatView.classList.remove('hide');
        if (wfView) wfView.classList.remove('show');
        if (btn) btn.classList.remove('active');
        if (sidebar) sidebar.classList.remove('hide-for-workflow');
      }
      function showWorkflowView() {
        var apiPage = document.getElementById('apiPageView');
        var chatView = document.getElementById('chatView');
        var wfView = document.getElementById('workflowView');
        var btn = document.getElementById('apiStorageBtn');
        var sidebar = document.getElementById('sidebar');
        if (apiPage) apiPage.classList.remove('show');
        if (chatView) chatView.classList.add('hide');
        if (wfView) wfView.classList.add('show');
        if (btn) btn.classList.remove('active');
        if (sidebar) sidebar.classList.add('hide-for-workflow');
        try {
          ensureWorkflowSessionOnEnter();
        } catch (e) {
          try { console.warn('ensureWorkflowSessionOnEnter', e); } catch (e2) {}
        }
        clearApiError();
        renderWorkflowUI();
        renderWorkflowSessionSelect();
        refreshWorkflowComfyHint();
        ensureImageApiAvailable();
      }
      function setupApiPageSwitch() {
        var apiStorageBtn = document.getElementById('apiStorageBtn');
        var apiPageBackBtn = document.getElementById('apiPageBackBtn');
        if (apiStorageBtn) apiStorageBtn.addEventListener('click', showApiPage);
        if (apiPageBackBtn) apiPageBackBtn.addEventListener('click', showChatView);
      }

      loadState();
      function initAfterConversationsLoaded() {
        initApiPanel();
        setupApiPageSwitch();
        setupMeetingButtons();
      }
      var conversationsLoadDone = false;
      function doneConversationsLoad() {
        if (conversationsLoadDone) return;
        conversationsLoadDone = true;
        initAfterConversationsLoaded();
      }
      setTimeout(doneConversationsLoad, 4000);
      fetch(window.location.origin + '/api/conversations')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && data.conversations && Array.isArray(data.conversations) && data.conversations.length > 0) {
            conversations = data.conversations;
            currentTabId = data.currentTabId && conversations.some(function (c) { return String(c.id) === String(data.currentTabId); }) ? String(data.currentTabId) : String(conversations[0].id);
            var maxId = Math.max.apply(null, conversations.map(function (c) { return Number(c.id) || 0; }).concat([0]));
            if (!isNaN(maxId)) tabIdCounter = maxId + 1;
            saveState();
          }
          doneConversationsLoad();
        })
        .catch(function () {
          doneConversationsLoad();
        });
      (function setupExtUI() {
        var overlay = document.getElementById('extModalOverlay');
        var runBtn = document.getElementById('runExtCodeBtn');
        var runModalBtn = document.getElementById('extRunBtn');
        var closeBtn = document.getElementById('extModalCloseBtn');
        var input = document.getElementById('extCodeInput');
        if (runBtn) runBtn.onclick = function () { if (overlay) overlay.classList.add('show'); if (input) input.focus(); };
        if (closeBtn) closeBtn.onclick = function () { if (overlay) overlay.classList.remove('show'); };
        if (overlay) overlay.onclick = function (e) { if (e.target === overlay) overlay.classList.remove('show'); };
        if (runModalBtn && input) runModalBtn.onclick = function () { runExtensionCode(input.value); overlay.classList.remove('show'); };
        var exportBtn = document.getElementById('exportStateBtn');
        var collectPcBtn = document.getElementById('collectComputerStateBtn');
        if (collectPcBtn) collectPcBtn.onclick = function () {
          collectPcBtn.disabled = true;
          fetch(window.location.origin + '/api/collect-computer-state', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              collectPcBtn.disabled = false;
              if (data.ok) {
                if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已写入 ' + (data.path || 'computer_state.json') + '，AI 可读取');
                else alert('已写入 ' + (data.path || 'zhiquan_workspace/computer_state.json') + '，在 Cursor 中让 AI 读该文件即可获得电脑状态。');
              } else { alert(data.error || '采集失败'); }
            })
            .catch(function (e) { collectPcBtn.disabled = false; alert('采集失败: ' + (e.message || e)); });
        };
        if (exportBtn) exportBtn.onclick = function () {
          var conv = getCurrentConversation();
          var payload = {
            currentTabId: currentTabId,
            conversations: conversations,
            modelListSummary: (modelList || []).map(function (m) { return { id: m.id, name: m.name }; })
          };
          fetch(window.location.origin + '/api/export-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function (r) { return r.json(); }).then(function (data) {
            if (data.ok) {
              if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已导出到 zhiquan_workspace/state.json，Cursor 可读取');
              else alert('已导出到 zhiquan_workspace/state.json');
            } else { alert(data.error || '导出失败'); }
          }).catch(function (e) { alert('导出失败: ' + (e.message || e)); });
        };
        var loadBtn = document.getElementById('loadWorkspaceBtn');
        var fileNameInput = document.getElementById('workspaceFileName');
        if (loadBtn) loadBtn.onclick = function () {
          var name = (fileNameInput && fileNameInput.value) ? fileNameInput.value.trim() : 'extension.js';
          if (!name) name = 'extension.js';
          fetch(window.location.origin + '/api/workspace-file?name=' + encodeURIComponent(name))
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data.content != null) {
                runExtensionCode(data.content);
                if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已运行: ' + name);
              } else { alert(data.error || '文件不存在或无法读取'); }
            })
            .catch(function (e) { alert('加载失败: ' + (e.message || e)); });
        };
        var createExtHelpBtn = document.getElementById('createExtHelpConvBtn');
        if (createExtHelpBtn) createExtHelpBtn.onclick = createExtHelpConversation;
        var saveExtVersionBtn = document.getElementById('saveExtVersionBtn');
        if (saveExtVersionBtn) saveExtVersionBtn.onclick = function () {
          var name = window.prompt('为此版本命名（留空则使用时间）', '');
          if (name === null) return;
          saveCurrentExtensionAsVersion(name || undefined);
        };
        var rollbackExtBtn = document.getElementById('rollbackExtBtn');
        if (rollbackExtBtn) rollbackExtBtn.onclick = showRollbackModal;
        var rollbackModalOverlay = document.getElementById('rollbackExtModalOverlay');
        var rollbackModalCloseBtn = document.getElementById('rollbackModalCloseBtn');
        if (rollbackModalOverlay && rollbackModalCloseBtn) rollbackModalCloseBtn.onclick = function () { rollbackModalOverlay.classList.remove('show'); };
        if (rollbackModalOverlay) rollbackModalOverlay.addEventListener('click', function (e) { if (e.target === rollbackModalOverlay) rollbackModalOverlay.classList.remove('show'); });
        var browserDataRefreshBtn = document.getElementById('browserDataRefreshBtn');
        if (browserDataRefreshBtn) browserDataRefreshBtn.onclick = refreshBrowserCapture;
        var browserDataInsertBtn = document.getElementById('browserDataInsertBtn');
        if (browserDataInsertBtn) browserDataInsertBtn.onclick = insertBrowserCaptureToInput;
        var wfBackBtn = document.getElementById('workflowBackBtn');
        if (wfBackBtn) wfBackBtn.onclick = function () { mainView = 'chat'; saveState(); showChatView(); renderTabs(); };
        var wfGenBtn = document.getElementById('wfGenerateBtn');
        if (wfGenBtn) wfGenBtn.onclick = function () { generateWorkflowBatch(); };
        var wfRerollBtn = document.getElementById('wfRerollBtn');
        if (wfRerollBtn) wfRerollBtn.onclick = function () { generateWorkflowBatch(); };
        var wfSaveBtn = document.getElementById('wfSaveSelectedBtn');
        if (wfSaveBtn) wfSaveBtn.onclick = function () { saveSelectedWorkflowImageAndNext(); };
        var wfApplyRecBtn = document.getElementById('wfApplyRecommendedBtn');
        if (wfApplyRecBtn) wfApplyRecBtn.onclick = function () { applyRecommendedPromptToPrompt(); };
        var wfApplySelTermsBtn = document.getElementById('wfApplySelectedTermsBtn');
        if (wfApplySelTermsBtn) wfApplySelTermsBtn.onclick = function () { applySelectedKeywordsToPrompt(); };
        var wfCollabSel = document.getElementById('wfCollabModel');
        if (wfCollabSel) wfCollabSel.onchange = function () { wfState.collabModel = wfCollabSel.value || ''; saveWorkflowState(); };
        var wfGenBackendEl = document.getElementById('wfGenBackend');
        if (wfGenBackendEl) wfGenBackendEl.addEventListener('change', function () { wfState.genBackend = wfGenBackendEl.value || 'comfyui'; saveWorkflowState(); refreshWorkflowComfyHint(); });
        var wfComfyuiBaseEl = document.getElementById('wfComfyuiBase');
        function syncWfComfyuiBaseFromInput() {
          if (!wfComfyuiBaseEl) return;
          var v = (wfComfyuiBaseEl.value || '').trim();
          wfState.comfyuiBase = v || 'http://127.0.0.1:8188';
          saveWorkflowState();
        }
        if (wfComfyuiBaseEl) {
          wfComfyuiBaseEl.addEventListener('change', syncWfComfyuiBaseFromInput);
          wfComfyuiBaseEl.addEventListener('blur', syncWfComfyuiBaseFromInput);
        }
        var wfComfyuiParseBtn = document.getElementById('wfComfyuiParseBtn');
        if (wfComfyuiParseBtn) wfComfyuiParseBtn.onclick = function () { applyComfyuiConsolePaste(); };
        var wfComfyuiPasteClearBtn = document.getElementById('wfComfyuiPasteClearBtn');
        if (wfComfyuiPasteClearBtn) wfComfyuiPasteClearBtn.onclick = function () {
          var ta = document.getElementById('wfComfyConsolePaste');
          if (ta) ta.value = '';
        };
        var wfComfyConsolePaste = document.getElementById('wfComfyConsolePaste');
        if (wfComfyConsolePaste) wfComfyConsolePaste.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            applyComfyuiConsolePaste();
          }
        });
        var wfShowGenBackendBtn = document.getElementById('wfShowGenBackendBtn');
        if (wfShowGenBackendBtn) wfShowGenBackendBtn.onclick = function () {
          wfState.hideImageGenBackendUi = false;
          saveWorkflowState();
          updateWfGenBackendSettingsVisibility();
        };
        var wfChatSendBtn = document.getElementById('wfChatSendBtn');
        if (wfChatSendBtn) wfChatSendBtn.onclick = function () { sendWorkflowChat('chat'); };
        var wfChatKwBtn = document.getElementById('wfChatKeywordsBtn');
        if (wfChatKwBtn) wfChatKwBtn.onclick = function () { sendWorkflowChat('keywords'); };
        var wfChatClearBtn = document.getElementById('wfChatClearBtn');
        if (wfChatClearBtn) wfChatClearBtn.onclick = function () {
          wfState.collabMessages = (wfState.collabMessages || []).filter(function (m) { return m.internal; });
          saveWorkflowState();
          renderWorkflowChatMessages();
          setWorkflowCollabStatus('');
        };
        var wfSyncCollabToChatBtn = document.getElementById('wfSyncCollabToChatBtn');
        if (wfSyncCollabToChatBtn) wfSyncCollabToChatBtn.onclick = function () { syncWorkflowCollabToCurrentConversation(); };
        var wfNewSessionBtn = document.getElementById('wfNewSessionBtn');
        if (wfNewSessionBtn) wfNewSessionBtn.onclick = function () {
          createWorkflowSessionWithFormatPrimer();
          renderWorkflowSessionSelect();
          renderWorkflowChatMessages();
          if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('已新建讨论并已注入格式说明');
        };
        var wfSessionSelect = document.getElementById('wfSessionSelect');
        if (wfSessionSelect) wfSessionSelect.onchange = function () {
          switchWorkflowSession(wfSessionSelect.value);
        };
        var wfSaveStylePresetBtn = document.getElementById('wfSaveStylePresetBtn');
        if (wfSaveStylePresetBtn) wfSaveStylePresetBtn.onclick = function () { saveStylePresetUser(); };
        var wfClearStyleStatsBtn = document.getElementById('wfClearStyleStatsBtn');
        if (wfClearStyleStatsBtn) wfClearStyleStatsBtn.onclick = function () { clearStyleStatsUser(); };
        var wfRefUploadBtn = document.getElementById('wfRefUploadBtn');
        var wfRefFileInput = document.getElementById('wfRefFileInput');
        if (wfRefUploadBtn && wfRefFileInput) wfRefUploadBtn.onclick = function () { wfRefFileInput.click(); };
        if (wfRefFileInput) wfRefFileInput.onchange = function (e) {
          wfAddRefImagesFromFiles(e.target.files);
          e.target.value = '';
        };
        setupWfRefDropZone();
        var wfRefClearBtn = document.getElementById('wfRefClearBtn');
        if (wfRefClearBtn) wfRefClearBtn.onclick = function () { clearWorkflowRefImages(); };
        var wfRefGenPromptBtn = document.getElementById('wfRefGenPromptBtn');
        if (wfRefGenPromptBtn) wfRefGenPromptBtn.onclick = function () { runWorkflowRefPrompt(); };
        var wfChatInput = document.getElementById('wfChatInput');
        if (wfChatInput) wfChatInput.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter' || e.shiftKey) return;
          if (e.isComposing || e.keyCode === 229) return;
          e.preventDefault();
          sendWorkflowChat('chat');
        });
        var apiQuickOverlay = document.getElementById('apiQuickSetupOverlay');
        var apiQuickSaveBtn = document.getElementById('apiQuickSaveBtn');
        var apiQuickCancelBtn = document.getElementById('apiQuickCancelBtn');
        if (apiQuickCancelBtn) apiQuickCancelBtn.onclick = closeApiQuickSetup;
        if (apiQuickOverlay) apiQuickOverlay.addEventListener('click', function (e) { if (e.target === apiQuickOverlay) closeApiQuickSetup(); });
        if (apiQuickSaveBtn) apiQuickSaveBtn.onclick = function () {
          var nameEl = document.getElementById('apiQuickName');
          var baseEl = document.getElementById('apiQuickBase');
          var keyEl = document.getElementById('apiQuickKey');
          var name = (nameEl && nameEl.value) ? nameEl.value.trim() : '默认';
          var base = (baseEl && baseEl.value) ? baseEl.value.trim() : '';
          var key = (keyEl && keyEl.value) ? keyEl.value.trim() : '';
          if (!base) { alert('请填写 API Base'); return; }
          // 保存到本地配置（apis 数组）
          var id = 'api-' + Date.now();
          apis = [{ id: id, name: name || id, base: base, key: key }];
          fetch(window.location.origin + '/api/local-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apis: apis })
          })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              closeApiQuickSetup();
              // 刷新列表与模型
              renderApiList();
              fetchModelsFromApis();
              if (window.ZhiQuanExt && window.ZhiQuanExt.toast) window.ZhiQuanExt.toast('API 已保存，正在刷新模型…');
            })
            .catch(function (e) { alert('保存失败: ' + (e.message || e)); });
        };
        var port = window.location.port || '8888';
        var bookmarkletUrl = 'javascript:(function(){var t=document.title;var u=location.href;var c=document.body?document.body.innerText:"";var s=window.getSelection?window.getSelection().toString():"";fetch("http://127.0.0.1:' + port + '/api/browser-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:u,title:t,content:c.substring(0,50000),selection:s,timestamp:new Date().toISOString()})}).then(function(){alert("已发送到' + APP_NAME + '");}).catch(function(){alert("发送失败，请确认' + APP_NAME + '已启动");});})();';
        var hintEl = document.getElementById('browserBookmarkletHint');
        if (hintEl) hintEl.innerHTML = '将下方链接拖到浏览器书签栏，在任意页面点击即可推送。HTTPS 页面可能被拦截时请用项目内 browser_extension 扩展。<br><a href="' + bookmarkletUrl + '" style="color:#7b68ee;font-size:0.75rem;">推送到' + APP_NAME + '</a>（拖到书签栏）';
        refreshBrowserCapture();
        restoreSavedExtensionOnLoad();
        if (mainView === 'workflow') showWorkflowView();
      })();
      window.addEventListener('beforeunload', function () { saveState(); });
      window.addEventListener('pagehide', function () { saveState(); });

      function showBackendHint() {
        var el = document.getElementById('backendHint');
        if (el) return;
        el = document.createElement('div');
        el.id = 'backendHint';
        el.style.cssText = 'margin:0 12px 8px;padding:8px 12px;background:#2a2a4a;border-radius:6px;font-size:0.85rem;color:#a0a0c0;';
        el.textContent = '未连接 AI 后端，仅可浏览界面。配置 LiteLLM 或 Ollama 后刷新即可对话。';
        var modelRow = document.querySelector('.model-row');
        if (modelRow && modelRow.parentNode) modelRow.parentNode.insertBefore(el, modelRow);
      }
      function clearBackendHint() {
        var el = document.getElementById('backendHint');
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    })();
  