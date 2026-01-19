(() => {
  const startChatBtn = document.getElementById("startChat");
  const sendChatBtn = document.getElementById("sendChat");
  if (startChatBtn) {
    startChatBtn.addEventListener("click", () => {
      alert("群聊模式暂不可用");
    });
  }
  if (sendChatBtn) {
    sendChatBtn.addEventListener("click", () => {
      alert("群聊模式暂不可用");
    });
  }
})();
