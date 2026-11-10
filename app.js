const selector = document.getElementById("languageSelector");

function setLanguage(lang) {
  const activeLanguage = Object.prototype.hasOwnProperty.call(translations, lang) ? lang : "en";
  document.documentElement.lang = activeLanguage;
  localStorage.setItem("language", activeLanguage);

  document.querySelectorAll("[data-key]").forEach((element) => {
    const translation = translations[activeLanguage][element.dataset.key];
    if (translation !== undefined) element.textContent = translation;
  });

  document.title = activeLanguage === "ja"
    ? "天使システムズエンジニアリング"
    : "Tenshi Systems Engineering";

  selector.value = activeLanguage;
}

selector.addEventListener("change", (event) => setLanguage(event.target.value));
document.getElementById("currentYear").textContent = new Date().getFullYear();
setLanguage(localStorage.getItem("language") || "en");
