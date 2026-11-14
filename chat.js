/* Tanaka Matsumoto, the AI assistant (chat.css for the look).
   - Without CHAT.endpoint, Tanaka answers from the site's own text in translations.js (services, contact, location,
     languages), in the visitor's language (English, Japanese, Korean or German).
   - With CHAT.endpoint set to the Cloudflare Worker in tools/chat-worker/, Tanaka answers with Claude, fed the site's
     service descriptions. The Claude API key lives only in the Worker, never in this file.
   - "Talk to a person" opens the visitor's email app with their message (and the chat, if they want) to CONTACT_EMAIL (app.js).
   Tanaka says plainly that he is an AI. Loaded on every page after translations.js and app.js. */
(function () {
  "use strict";

  var CHAT = {
    // The address of the Worker in tools/chat-worker/, e.g. "https://tenshi-chat.yourname.workers.dev". Empty: local answers only.
    endpoint: ""
  };

  // Where the site's files are, so links work from the homepage and from services/*.html.
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.getAttribute("src") || "chat.js";
    return s.replace(/chat\.js.*$/, "");
  })();
  var EMAIL = typeof CONTACT_EMAIL === "string" ? CONTACT_EMAIL : "";
  var T = window.TRANSLATIONS || {};
  var SERVICES = [
    ["software", "software-development"], ["consulting", "technology-consulting"], ["media", "media-design"],
    ["webdesign", "web-design"], ["webdev", "web-development"], ["hosting", "hosting"],
    ["ai", "ai-services"], ["cms", "content-management"], ["branding", "branding"]
  ];

  /* ---------- the chat's own words, in each language ---------- */
  var UI = {
    en: {
      launch: "Ask Tanaka", launchLabel: "Chat with Tanaka Matsumoto, AI assistant",
      role: "AI assistant · Tenshi Systems Engineering", online: "online", introRole: "AI assistant",
      introNote: "Tenshi Systems Engineering · always available",
      placeholder: "Ask about our services…", send: "Send", close: "Close chat", human: "Talk to a person",
      foot: "Tanaka is an AI assistant and can make mistakes.", typing: "Tanaka is typing",
      greet: "Hello, I'm **Tanaka Matsumoto**, the AI assistant for Tenshi Systems Engineering. Ask me about our services, or how to request a consultation.",
      chips: [["What services do you offer?", "What services do you offer?"], ["Web design", "Tell me about web design"], ["AI services", "Tell me about AI services"], ["Request a consultation", "How do I request a consultation?"]],
      more: [["All services", "What services do you offer?"], ["Prices", "How much does a project cost?"], ["Where are you based?", "Where are you based?"], ["Request a consultation", "How do I request a consultation?"]],
      listIntro: "We offer nine services. Ask me about any of them:",
      offers: "What's included:", details: "Full details",
      consult: "The quickest way is the **consultation form** on the homepage: tell us about your project, press Send, and your email app opens with the message ready to go. I can also pass a message to the team for you.",
      consultLink: "Consultation form",
      price: "We don't publish fixed prices, because every project is different. Send a consultation request with a few details and the team will reply with a proposal.",
      location: "Tenshi Systems Engineering is based in **Osaka, Japan**.",
      lang: "This website is available in English, Japanese, Korean and German. Use the flag button at the top to switch. You can write to me in any of those languages.",
      who: "I'm Tanaka Matsumoto, an **AI assistant**, not a person. I can explain our services and help you get in touch with the team.",
      thanks: "You're welcome. Is there anything else I can help with?",
      hello: "Hello! What can I help you with today?",
      fallback: "I'm not sure about that one. I can tell you about our services, or pass your question on to a person on the team.",
      humanIntro: "Of course. Write your message below and press **Open email**: your email app opens with it addressed to our team. A person will reply by email.",
      formMsg: "Your message", formLog: "Include this chat", formSend: "Open email", formCopy: "Copy message", formCopied: "Copied",
      formEmpty: "Please write a short message first.",
      formDone: "Your email app should open now with the message. If it doesn't, write to {email}.",
      mailSubject: "Message from the website chat", chatHeader: "Chat with Tanaka (AI assistant)", visitor: "Visitor"
    },
    ja: {
      launch: "Tanakaに相談", launchLabel: "AIアシスタント Tanaka Matsumoto とチャット",
      role: "AIアシスタント・天使システムズエンジニアリング", online: "オンライン", introRole: "AIアシスタント",
      introNote: "天使システムズエンジニアリング・いつでも対応",
      placeholder: "サービスについて質問する…", send: "送信", close: "チャットを閉じる", human: "担当者と話す",
      foot: "TanakaはAIアシスタントのため、誤りがある場合があります。", typing: "Tanakaが入力中",
      greet: "こんにちは。天使システムズエンジニアリングのAIアシスタント、**Tanaka Matsumoto**です。サービス内容やご相談の方法について、お気軽にご質問ください。",
      chips: [["どんなサービスがありますか？", "どんなサービスがありますか？"], ["ウェブデザイン", "ウェブデザインについて教えてください"], ["AIサービス", "AIサービスについて教えてください"], ["相談を申し込む", "相談はどうやって申し込めますか？"]],
      more: [["すべてのサービス", "どんなサービスがありますか？"], ["料金", "料金はいくらですか？"], ["所在地", "どこにありますか？"], ["相談を申し込む", "相談はどうやって申し込めますか？"]],
      listIntro: "9つのサービスをご提供しています。気になるものをお尋ねください：",
      offers: "主な内容：", details: "詳しく見る",
      consult: "いちばん早いのは、ホームページの**ご相談フォーム**です。プロジェクトの内容を入力して「送信」を押すと、メッセージが入った状態でメールアプリが開きます。私から担当者へお伝えすることもできます。",
      consultLink: "ご相談フォーム",
      price: "プロジェクトごとに内容が異なるため、固定の料金は掲載していません。概要を添えてご相談いただければ、担当者からご提案をお送りします。",
      location: "天使システムズエンジニアリングは**大阪**を拠点としています。",
      lang: "このウェブサイトは英語・日本語・韓国語・ドイツ語でご覧いただけます。上部の国旗ボタンで切り替えられます。どの言語でも話しかけてください。",
      who: "私はTanaka Matsumoto、**AIアシスタント**で、人間ではありません。サービスのご説明や、担当者へのご連絡のお手伝いをします。",
      thanks: "どういたしまして。ほかにお手伝いできることはありますか？",
      hello: "こんにちは。今日はどのようなご用件でしょうか？",
      fallback: "その点については分かりかねます。サービスについてのご説明か、担当者へのお取り次ぎができます。",
      humanIntro: "かしこまりました。下にメッセージを入力して**メールを作成**を押すと、担当者宛てのメールがメールアプリで開きます。担当者からメールでお返事します。",
      formMsg: "メッセージ", formLog: "このチャットの内容を添える", formSend: "メールを作成", formCopy: "メッセージをコピー", formCopied: "コピーしました",
      formEmpty: "先に短いメッセージをご入力ください。",
      formDone: "メッセージが入った状態でメールアプリが開きます。開かない場合は {email} までご連絡ください。",
      mailSubject: "ウェブサイトのチャットからのメッセージ", chatHeader: "Tanaka（AIアシスタント）とのチャット", visitor: "訪問者"
    },
    ko: {
      launch: "Tanaka에게 문의", launchLabel: "AI 어시스턴트 Tanaka Matsumoto와 채팅",
      role: "AI 어시스턴트 · 텐시 시스템즈 엔지니어링", online: "온라인", introRole: "AI 어시스턴트",
      introNote: "텐시 시스템즈 엔지니어링 · 언제든지 응답",
      placeholder: "서비스에 대해 물어보세요…", send: "보내기", close: "채팅 닫기", human: "담당자와 이야기하기",
      foot: "Tanaka는 AI 어시스턴트이므로 틀릴 수 있습니다.", typing: "Tanaka가 입력 중",
      greet: "안녕하세요. 텐시 시스템즈 엔지니어링의 AI 어시스턴트 **Tanaka Matsumoto**입니다. 서비스나 상담 신청 방법에 대해 편하게 물어보세요.",
      chips: [["어떤 서비스가 있나요?", "어떤 서비스가 있나요?"], ["웹 디자인", "웹 디자인에 대해 알려 주세요"], ["AI 서비스", "AI 서비스에 대해 알려 주세요"], ["상담 신청", "상담은 어떻게 신청하나요?"]],
      more: [["모든 서비스", "어떤 서비스가 있나요?"], ["가격", "비용은 얼마인가요?"], ["위치", "어디에 있나요?"], ["상담 신청", "상담은 어떻게 신청하나요?"]],
      listIntro: "9가지 서비스를 제공합니다. 궁금한 것을 물어보세요:",
      offers: "주요 내용:", details: "자세히 보기",
      consult: "가장 빠른 방법은 홈페이지의 **상담 양식**입니다. 프로젝트 내용을 적고 '보내기'를 누르면 메시지가 작성된 상태로 이메일 앱이 열립니다. 제가 담당자에게 메시지를 전해 드릴 수도 있습니다.",
      consultLink: "상담 양식",
      price: "프로젝트마다 내용이 달라 정해진 가격은 공개하지 않습니다. 간단한 내용을 적어 상담을 신청하시면 담당자가 제안을 보내 드립니다.",
      location: "텐시 시스템즈 엔지니어링은 **일본 오사카**에 있습니다.",
      lang: "이 웹사이트는 영어, 일본어, 한국어, 독일어로 볼 수 있습니다. 위쪽의 국기 버튼으로 바꿀 수 있어요. 어느 언어로든 말씀해 주세요.",
      who: "저는 Tanaka Matsumoto, 사람이 아닌 **AI 어시스턴트**입니다. 서비스를 설명해 드리고 담당자와 연락하실 수 있도록 도와드립니다.",
      thanks: "천만에요. 더 도와드릴 일이 있을까요?",
      hello: "안녕하세요! 무엇을 도와드릴까요?",
      fallback: "그 부분은 잘 모르겠습니다. 서비스에 대해 알려 드리거나, 질문을 담당자에게 전해 드릴 수 있습니다.",
      humanIntro: "알겠습니다. 아래에 메시지를 적고 **이메일 작성**을 누르면 담당자에게 보내는 이메일이 이메일 앱에서 열립니다. 담당자가 이메일로 답변드립니다.",
      formMsg: "메시지", formLog: "이 채팅 내용 포함", formSend: "이메일 작성", formCopy: "메시지 복사", formCopied: "복사됨",
      formEmpty: "먼저 짧은 메시지를 적어 주세요.",
      formDone: "메시지가 작성된 상태로 이메일 앱이 열립니다. 열리지 않으면 {email}로 연락해 주세요.",
      mailSubject: "웹사이트 채팅에서 보낸 메시지", chatHeader: "Tanaka(AI 어시스턴트)와의 채팅", visitor: "방문자"
    },
    de: {
      launch: "Tanaka fragen", launchLabel: "Chat mit Tanaka Matsumoto, KI-Assistent",
      role: "KI-Assistent · Tenshi Systems Engineering", online: "online", introRole: "KI-Assistent",
      introNote: "Tenshi Systems Engineering · jederzeit erreichbar",
      placeholder: "Fragen Sie zu unseren Leistungen…", send: "Senden", close: "Chat schließen", human: "Mit einem Menschen sprechen",
      foot: "Tanaka ist ein KI-Assistent und kann sich irren.", typing: "Tanaka schreibt",
      greet: "Hallo, ich bin **Tanaka Matsumoto**, der KI-Assistent von Tenshi Systems Engineering. Fragen Sie mich zu unseren Leistungen oder wie Sie eine Beratung anfragen.",
      chips: [["Welche Leistungen bieten Sie an?", "Welche Leistungen bieten Sie an?"], ["Webdesign", "Erzählen Sie mir von Webdesign"], ["KI-Dienste", "Erzählen Sie mir von KI-Diensten"], ["Beratung anfragen", "Wie kann ich eine Beratung anfragen?"]],
      more: [["Alle Leistungen", "Welche Leistungen bieten Sie an?"], ["Preise", "Was kostet ein Projekt?"], ["Standort", "Wo sitzen Sie?"], ["Beratung anfragen", "Wie kann ich eine Beratung anfragen?"]],
      listIntro: "Wir bieten neun Leistungen an. Fragen Sie mich zu jeder davon:",
      offers: "Das gehört dazu:", details: "Alle Details",
      consult: "Am schnellsten geht es mit dem **Beratungsformular** auf der Startseite: Beschreiben Sie Ihr Projekt, klicken Sie auf „Senden“, und Ihr E-Mail-Programm öffnet sich mit der fertigen Nachricht. Ich kann auch eine Nachricht an das Team weitergeben.",
      consultLink: "Beratungsformular",
      price: "Wir veröffentlichen keine Festpreise, weil jedes Projekt anders ist. Senden Sie eine Beratungsanfrage mit ein paar Details, und das Team antwortet mit einem Angebot.",
      location: "Tenshi Systems Engineering hat seinen Sitz in **Osaka, Japan**.",
      lang: "Diese Website gibt es auf Englisch, Japanisch, Koreanisch und Deutsch. Mit der Flaggen-Schaltfläche oben wechseln Sie die Sprache. Sie können mir in jeder dieser Sprachen schreiben.",
      who: "Ich bin Tanaka Matsumoto, ein **KI-Assistent** und kein Mensch. Ich erkläre unsere Leistungen und helfe Ihnen, Kontakt mit dem Team aufzunehmen.",
      thanks: "Gern geschehen. Kann ich sonst noch helfen?",
      hello: "Hallo! Wobei kann ich Ihnen heute helfen?",
      fallback: "Da bin ich mir nicht sicher. Ich kann Ihnen unsere Leistungen erklären oder Ihre Frage an einen Menschen im Team weitergeben.",
      humanIntro: "Gern. Schreiben Sie unten Ihre Nachricht und klicken Sie auf **E-Mail öffnen**: Ihr E-Mail-Programm öffnet sich mit der Nachricht an unser Team. Ein Mensch antwortet per E-Mail.",
      formMsg: "Ihre Nachricht", formLog: "Diesen Chat anhängen", formSend: "E-Mail öffnen", formCopy: "Nachricht kopieren", formCopied: "Kopiert",
      formEmpty: "Bitte schreiben Sie zuerst eine kurze Nachricht.",
      formDone: "Ihr E-Mail-Programm sollte sich jetzt mit der Nachricht öffnen. Falls nicht, schreiben Sie an {email}.",
      mailSubject: "Nachricht aus dem Website-Chat", chatHeader: "Chat mit Tanaka (KI-Assistent)", visitor: "Besucher"
    }
  };

  /* ---------- small helpers ---------- */
  function lang() { var l = document.documentElement.lang; return UI[l] ? l : "en"; }
  function u(key) { return UI[lang()][key]; }
  function tr(key) { var L = T[lang()] || {}; return L[key] !== undefined ? L[key] : (T.en || {})[key] || ""; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]{1,80})\]\(([^)\s]{1,200})\)/g, function (m, t, href) {
        var h = href.replace(/&amp;/g, "&");
        if (!/^(https?:\/\/|[a-z0-9-]+\.html|index\.html|services\/)/i.test(h)) return t;
        if (!/^https?:/.test(h)) h = BASE + h;
        return '<a href="' + esc(h) + '">' + t + "</a>";
      });
  }
  function md(text) {
    var out = "", list = false;
    String(text || "").split("\n").forEach(function (l) {
      var li = /^\s*[-•]\s+(.*)/.exec(l);
      if (li) { if (!list) { out += "<ul>"; list = true; } out += "<li>" + inline(li[1]) + "</li>"; return; }
      if (list) { out += "</ul>"; list = false; }
      if (l.trim()) out += "<p>" + inline(l) + "</p>";
    });
    return out + (list ? "</ul>" : "");
  }
  function store(k, v) {
    try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k) || "null"); sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  }
  function svg(name) {
    var p = {
      send: '<path d="M4 12 20 4l-6 16-2.5-6.5z"/><path d="m11.5 13.5 4-4"/>',
      close: '<path d="M6 6l12 12M18 6 6 18"/>',
      human: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5"/>',
      chat: '<path d="M5 5h14v10H9l-4 4z"/>'
    }[name];
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }
  // Tanaka's badge: a monogram in the company's red, with a spark for "AI". An emblem, not a photo of a person.
  var BADGE = '<svg class="tk-badge" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="tkg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0263f"/><stop offset="1" stop-color="#8e0b20"/></linearGradient></defs>' +
    '<circle cx="24" cy="24" r="24" fill="url(#tkg)"/><circle cx="24" cy="24" r="20.5" fill="none" stroke="#fff" stroke-opacity=".35"/>' +
    '<text x="24" y="30.5" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-weight="800" font-size="17" fill="#fff" letter-spacing=".5">TM</text>' +
    '<path d="M36.5 9.5l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2z" fill="#fff"/></svg>';

  // His illustrated portrait (img/tanaka.svg) replaces the monogram wherever it appears.
  BADGE = '<img class="tk-badge" src="' + BASE + 'img/tanaka.svg" alt="" width="200" height="200">';

  /* ---------- answers from the site's own text ---------- */
  var KEYS = {
    webdesign: /web ?design|website design|site design|ui|ux|ウェブデザイン|サイトデザイン|웹 ?디자인|webdesign/,
    webdev: /web ?dev|web development|website develop|build (a |my )?(web)?site|e-?commerce|online (store|shop)|booking|ウェブ開発|サイト制作|ec|웹 ?개발|쇼핑몰|webentwicklung|onlineshop/,
    software: /software|application|\bapp\b|program|ソフトウェア|アプリ|システム開発|소프트웨어|앱|애플리케이션|softwareentwicklung|anwendung/,
    consulting: /consult(ing)?\b(?! request)|strategy|roadmap|advice|modernis|moderniz|コンサル|戦略|컨설팅|전략|beratung(?!sanfrage)|strategie|technologieberatung/,
    media: /media|video|graphic|motion|photo|presentation|メディア|映像|グラフィック|動画|미디어|영상|그래픽|medien|grafik|videoschnitt/,
    hosting: /host|domain|ssl|server|backup|uptime|dns|ホスティング|ドメイン|サーバー|バックアップ|호스팅|도메인|서버|백업|domains?\b/,
    ai: /\bai\b|a\.i\.|artificial|chatbot|chat assistant|automat|machine learning|ＡＩ|人工知能|自動化|チャットボット|인공지능|자동화|챗봇|\bki\b|künstlich|kuenstlich/,
    cms: /\bcms\b|content manag|wordpress|update (my |the )?(site|website|pages)|コンテンツ管理|更新|콘텐츠 ?관리|content-management|inhalte/,
    branding: /brand|logo|identity|typograph|ブランド|ロゴ|브랜드|로고|marke|logo/
  };
  var INTENTS = [
    ["who", /who are you|are you (an? )?(real )?(ai|bot|robot|human|person|real)|your name|あなたは(誰|だれ)|ロボット|人間ですか|aiですか|누구|봇이|사람이에요|사람인가요|wer bist|sind sie (ein )?(mensch|bot|ki)|bist du (ein )?(mensch|bot|ki)/],
    ["human", /talk to (a |an )?(real )?(person|human|someone|staff)|speak (to|with) (a |an )?(real )?(person|human|someone)|contact (a |an )?(person|human)|担当者と|人と話|사람과 (이야기|대화)|담당자와|mit einem menschen|mitarbeiter sprechen/],
    ["price", /price|pricing|cost|how much|rate|budget|quote|estimate|料金|費用|いくら|価格|見積|가격|비용|얼마|견적|preis|kosten|kostet|wie viel|wie teuer|angebot/],
    ["consult", /consultation|contact|reach|get in touch|email|e-mail|hire|start a project|work with|相談|問い合わせ|お問合せ|連絡|依頼|상담|문의|연락|의뢰|kontakt|beratungsanfrage|beratung anfragen|anfrage|erreichen/],
    ["location", /where|location|located|based|office|address|osaka|japan|どこ|場所|所在地|大阪|어디|위치|오사카|wo (sind|sitzen|ist)|standort|sitz/],
    ["lang", /language|english|japanese|korean|german|translate|言語|英語|韓国語|ドイツ語|언어|영어|일본어|독일어|sprache|englisch|japanisch|koreanisch/],
    ["list", /services|what do you (do|offer)|what can you do|offer|サービス|事業|何をして|서비스|무엇을|leistungen|angebot|was (machen|bieten)/],
    ["thanks", /thank|thx|ありがとう|感謝|감사|고마워|고맙|danke/],
    ["hello", /^(hi|hello|hey|good (morning|afternoon|evening)|こんにちは|こんばんは|おはよう|안녕|hallo|guten (tag|morgen|abend)|servus)\b/]
  ];
  function fold(s) { return String(s || "").toLowerCase().normalize("NFKC"); }
  function serviceAnswer(id, slug) {
    var offers = [1, 2, 3, 4, 5].map(function (n) { return "- " + tr("svc_" + id + "_o" + n); }).join("\n");
    return { text: "**" + tr("svc_" + id + "_title") + "**\n" + tr("svc_" + id + "_intro") + "\n" + u("offers") + "\n" + offers,
      links: [{ href: "services/" + slug + ".html", label: u("details") + ": " + tr("svc_" + id + "_title") }, { href: "index.html#contact", label: u("consultLink") }] };
  }
  function local(q) {
    var f = fold(q);
    // A named service first, so "how much is hosting?" still talks about hosting.
    for (var i = 0; i < SERVICES.length; i++) {
      var id = SERVICES[i][0];
      if (KEYS[id].test(f) && !/^(how much|price|料金|가격|preis)/.test(f)) return serviceAnswer(id, SERVICES[i][1]);
    }
    for (var j = 0; j < INTENTS.length; j++) if (INTENTS[j][1].test(f)) {
      var k = INTENTS[j][0];
      if (k === "human") return { text: u("humanIntro"), handoff: true };
      if (k === "list") return {
        text: u("listIntro") + "\n" + SERVICES.map(function (s) { return "- [" + tr("svc_" + s[0] + "_title") + "](services/" + s[1] + ".html): " + tr("svc_" + s[0] + "_short"); }).join("\n")
      };
      if (k === "consult" || k === "price") return { text: u(k), links: [{ href: "index.html#contact", label: u("consultLink") }], offerHuman: true };
      return { text: u(k) };
    }
    // Last try: the service whose text shares the most words with the question.
    var words = f.split(/[^\p{L}\p{N}]+/u).filter(function (w) { return w.length > 3; });
    var best = null, bestScore = 0;
    SERVICES.forEach(function (s) {
      var text = fold([tr("svc_" + s[0] + "_title"), tr("svc_" + s[0] + "_short"), tr("svc_" + s[0] + "_intro")].join(" "));
      var score = words.filter(function (w) { return text.indexOf(w) !== -1; }).length;
      if (score > bestScore) { best = s; bestScore = score; }
    });
    if (best && bestScore >= 2) return serviceAnswer(best[0], best[1]);
    return { text: u("fallback"), offerHuman: true };
  }

  /* ---------- answers from Claude, through the Worker ---------- */
  function ai(q) {
    var history = state.msgs.filter(function (m) { return m.r === "me" || m.r === "bot"; }).slice(-12)
      .map(function (m) { return { role: m.r === "me" ? "user" : "assistant", content: m.text }; });
    var services = SERVICES.map(function (s) {
      return { title: tr("svc_" + s[0] + "_title"), url: "services/" + s[1] + ".html", text: tr("svc_" + s[0] + "_intro") + " " + [1, 2, 3, 4, 5].map(function (n) { return tr("svc_" + s[0] + "_o" + n); }).join("; ") };
    });
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 25000);
    return fetch(CHAT.endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ messages: history, services: services, language: lang(), page: location.pathname })
    }).then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (d) {
        var text = String(d.reply || "").trim();
        if (!text) throw new Error("empty");
        var handoff = /\[\[HANDOFF\]\]/.test(text);
        return { text: text.replace(/\s*\[\[HANDOFF\]\]\s*/g, " ").trim(), handoff: handoff };
      });
  }

  /* ---------- the chat itself ---------- */
  var KEY = "tse-chat-v1";
  var state = store(KEY) || { msgs: [], opened: false };
  var root, launch, panel, log, chipsEl, ta, sendBtn, busy = false, aiDown = false;
  function save() { state.msgs = state.msgs.slice(-60); store(KEY, state); }

  function rowHTML(m, cont) {
    if (m.r === "intro") return '<div class="tk-intro">' + BADGE.replace('class="tk-badge"', 'class="tk-badge tk-badge-lg"') +
      '<div class="tk-intro-cap"><b>TANAKA MATSUMOTO</b><span>' + esc(u("introRole")) + "</span><em>" + esc(u("introNote")) + "</em></div></div>";
    var links = (m.links || []).map(function (l) {
      return '<a href="' + esc(BASE + l.href) + '">' + esc(l.label) + "<i>→</i></a>";
    }).join("");
    var ava = m.r === "bot" ? '<span class="tk-mini">' + BADGE + "</span>" : "";
    return '<div class="tk-row ' + m.r + (cont ? " cont" : "") + '">' + ava + '<div class="tk-bub">' + md(m.text) +
      (links ? '<div class="tk-links">' + links + "</div>" : "") + "</div></div>";
  }
  function renderAll() {
    log.innerHTML = "";
    var prev = null;
    state.msgs.forEach(function (m) { log.insertAdjacentHTML("beforeend", rowHTML(m, prev && prev.r === "bot" && m.r === "bot")); prev = m; });
    var last = state.msgs[state.msgs.length - 1];
    if (last && last.handoff && !last.done) showForm(last.prefill);
    scrollEnd(true);
  }
  function push(m) {
    var prev = state.msgs[state.msgs.length - 1];
    state.msgs.push(m); save();
    log.insertAdjacentHTML("beforeend", rowHTML(m, prev && prev.r === "bot" && m.r === "bot"));
    scrollEnd();
  }
  function scrollEnd(now) { log.scrollTo({ top: log.scrollHeight, behavior: now ? "auto" : "smooth" }); }
  function typing(on) {
    var t = log.querySelector(".tk-row.typing");
    if (on && !t) {
      log.insertAdjacentHTML("beforeend", '<div class="tk-row bot typing"><span class="tk-mini">' + BADGE + '</span><div class="tk-bub tk-typing" role="status" aria-label="' + esc(u("typing")) + '"><i></i><i></i><i></i></div></div>');
      scrollEnd();
    } else if (!on && t) t.remove();
  }
  function setChips(list, withHuman) {
    var html = (list || []).map(function (c) { return '<button type="button" data-say="' + esc(c[1]) + '">' + esc(c[0]) + "</button>"; }).join("");
    if (withHuman) html += '<button type="button" class="human" data-human>' + esc(u("human")) + "</button>";
    chipsEl.innerHTML = html;
    chipsEl.hidden = !html;
  }

  function ask(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    // A new question replaces an unfinished "talk to a person" form.
    var oldForm = log.querySelector(".tk-formrow");
    if (oldForm) { oldForm.remove(); var lastMsg = state.msgs[state.msgs.length - 1]; if (lastMsg) lastMsg.done = true; }
    push({ r: "me", text: text.slice(0, 1500) });
    ta.value = ""; autosize();
    setChips([]);
    typing(true);
    var started = Date.now();
    var p = CHAT.endpoint && !aiDown ? ai(text).catch(function () { aiDown = true; return local(text); }) : Promise.resolve(local(text));
    p.then(function (ans) {
      var wait = Math.max(0, Math.min(1300, 400 + ans.text.length * 3) - (Date.now() - started));
      setTimeout(function () {
        typing(false);
        push({ r: "bot", text: ans.text, links: ans.links, handoff: !!ans.handoff, prefill: ans.handoff ? text : undefined });
        if (ans.handoff) { showForm(text); setChips([]); }
        else setChips(u("more"), true);
        busy = false; sendBtn.disabled = !ta.value.trim();
        if (!panel.hidden) ta.focus({ preventScroll: true });
      }, wait);
    });
  }

  /* ---------- talk to a person: the visitor's own email app ---------- */
  function lastQuestion() {
    for (var i = state.msgs.length - 1; i >= 0; i--) if (state.msgs[i].r === "me") return state.msgs[i].text;
    return "";
  }
  function startHuman() {
    if (log.querySelector(".tk-form")) { log.querySelector(".tk-form textarea").focus(); return; }
    push({ r: "bot", text: u("humanIntro"), handoff: true, prefill: lastQuestion() });
    showForm(lastQuestion());
    setChips([]);
  }
  function transcript() {
    return state.msgs.filter(function (m) { return m.r === "me" || m.r === "bot"; }).map(function (m) {
      return (m.r === "me" ? u("visitor") : "Tanaka") + ": " + String(m.text).replace(/\*\*/g, "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
    }).join("\n");
  }
  function showForm(prefill) {
    var old = log.querySelector(".tk-formrow"); if (old) old.remove();
    log.insertAdjacentHTML("beforeend",
      '<div class="tk-row bot cont tk-formrow"><span class="tk-mini">' + BADGE + '</span><div class="tk-bub"><form class="tk-form" novalidate>' +
      "<label>" + esc(u("formMsg")) + '<textarea name="message" maxlength="3000" rows="4">' + esc(prefill || "") + "</textarea></label>" +
      '<label class="tk-check"><input type="checkbox" name="withlog" checked> ' + esc(u("formLog")) + "</label>" +
      '<p class="tk-err" role="alert"></p>' +
      '<div class="tk-form-actions"><button type="submit">' + esc(u("formSend")) + '</button><button type="button" class="tk-copy">' + esc(u("formCopy")) + "</button></div>" +
      "</form></div></div>");
    scrollEnd();
    var f = log.querySelector(".tk-form");
    setTimeout(function () { f.message.focus({ preventScroll: true }); }, 50);
  }
  function fullMessage(form) {
    return form.message.value.trim() + (form.withlog.checked ? "\n\n--- " + u("chatHeader") + " ---\n" + transcript() : "");
  }
  function sendHuman(form) {
    var err = form.querySelector(".tk-err");
    if (form.message.value.trim().length < 2) { err.textContent = u("formEmpty"); form.message.focus(); return; }
    err.textContent = "";
    var url = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(u("mailSubject")) + "&body=" + encodeURIComponent(fullMessage(form));
    var last = state.msgs[state.msgs.length - 1]; if (last) last.done = true;
    form.closest(".tk-row").remove();
    push({ r: "bot", text: u("formDone").replace("{email}", EMAIL) });
    setChips(u("more"), false);
    window.location.href = url;
  }
  function copyHuman(form, btn) {
    var text = fullMessage(form);
    function ok() { btn.textContent = u("formCopied"); setTimeout(function () { btn.textContent = u("formCopy"); }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { window.prompt("", text); });
    else window.prompt("", text);
  }

  /* ---------- open, close, language ---------- */
  function labels() {
    launch.setAttribute("aria-label", u("launchLabel"));
    launch.querySelector(".tk-label").textContent = u("launch");
    panel.setAttribute("aria-label", u("launchLabel"));
    panel.querySelector(".tk-who span").textContent = u("role") + " · " + u("online");
    panel.querySelector("[data-close]").setAttribute("aria-label", u("close"));
    panel.querySelector(".tk-head [data-human]").setAttribute("aria-label", u("human"));
    panel.querySelector(".tk-head [data-human]").title = u("human");
    ta.placeholder = u("placeholder");
    ta.setAttribute("aria-label", u("placeholder"));
    sendBtn.setAttribute("aria-label", u("send"));
    panel.querySelector(".tk-foot span").textContent = u("foot");
    panel.querySelector(".tk-foot button").textContent = u("human");
  }
  function open() {
    document.documentElement.classList.add("tk-open");
    panel.hidden = false;
    panel.classList.remove("tk-out"); panel.classList.add("tk-in");
    state.opened = true; save();
    if (!state.msgs.length) {
      push({ r: "intro", text: "" });
      typing(true);
      setTimeout(function () { typing(false); push({ r: "bot", text: u("greet") }); setChips(u("chips"), true); }, 600);
    } else {
      renderAll();
      var last = state.msgs[state.msgs.length - 1];
      setChips(last && last.handoff && !last.done ? [] : u("more"), !(last && last.handoff && !last.done));
    }
    setTimeout(function () { ta.focus({ preventScroll: true }); }, 80);
  }
  function close() {
    if (panel.hidden) return;
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.classList.remove("tk-in"); panel.classList.add("tk-out");
    setTimeout(function () {
      panel.hidden = true; panel.classList.remove("tk-out");
      document.documentElement.classList.remove("tk-open");
      state.opened = false; save();
      launch.focus({ preventScroll: true });
    }, reduce ? 0 : 170);
  }
  function autosize() { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; sendBtn.disabled = busy || !ta.value.trim(); }

  function build() {
    root = document.createElement("div");
    root.className = "tk-root";
    root.innerHTML =
      '<button class="tk-launch" type="button"><span class="tk-orb">' + BADGE + '</span><span class="tk-dot" aria-hidden="true"></span><span class="tk-label"></span></button>' +
      '<section class="tk-panel" role="dialog" hidden>' +
      '<header class="tk-head"><span class="tk-ava">' + BADGE + '</span><div class="tk-who"><b>Tanaka Matsumoto</b><span></span></div>' +
      '<button class="tk-hbtn" type="button" data-human>' + svg("human") + "</button>" +
      '<button class="tk-hbtn" type="button" data-close>' + svg("close") + "</button></header>" +
      '<div class="tk-log" role="log" aria-live="polite"></div>' +
      '<div class="tk-chips" hidden></div>' +
      '<form class="tk-input"><textarea rows="1" maxlength="1500"></textarea><button class="tk-send" type="submit" disabled>' + svg("send") + "</button></form>" +
      '<div class="tk-foot"><span></span> <button type="button" data-human></button></div>' +
      "</section>";
    document.body.appendChild(root);
    launch = root.querySelector(".tk-launch");
    panel = root.querySelector(".tk-panel");
    log = root.querySelector(".tk-log");
    chipsEl = root.querySelector(".tk-chips");
    ta = root.querySelector(".tk-input textarea");
    sendBtn = root.querySelector(".tk-send");
    labels();

    launch.addEventListener("click", open);
    root.querySelector(".tk-input").addEventListener("submit", function (e) { e.preventDefault(); ask(ta.value); });
    ta.addEventListener("input", autosize);
    ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(ta.value); } });
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    panel.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("[data-close]")) { close(); return; }
      if (t.closest("[data-human]")) { e.preventDefault(); startHuman(); return; }
      if (t.closest(".tk-copy")) { copyHuman(t.closest("form"), t.closest(".tk-copy")); return; }
      var c = t.closest("[data-say]");
      if (c) ask(c.dataset.say);
    });
    panel.addEventListener("submit", function (e) { if (e.target.classList.contains("tk-form")) { e.preventDefault(); sendHuman(e.target); } });
    // The site's language switch: relabel the chat and redraw its messages' own wording.
    document.addEventListener("tse:lang", function () {
      labels();
      if (!panel.hidden) {
        renderAll();
        var last = state.msgs[state.msgs.length - 1];
        if (!(last && last.handoff && !last.done)) setChips(u("more"), true);
      }
    });
  }

  function init() {
    build();
    document.querySelectorAll("[data-open-chat]").forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); open(); }); });
    // Reopen where they left off on computers; on phones the chat covers the screen, so wait for a tap.
    if (state.opened && window.innerWidth > 600) open();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
