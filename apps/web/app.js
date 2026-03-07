const panelIds = [
  "capture",
  "avatar",
  "transcript",
  "emotion",
  "chat",
  "control",
];

const missingPanels = panelIds.filter(
  (panelId) => !document.querySelector(`[data-panel="${panelId}"]`),
);

if (missingPanels.length > 0) {
  console.error("Missing static panels:", missingPanels.join(", "));
} else {
  document.body.dataset.uiReady = "true";
  console.info("Static frontend shell ready");
}
