function createWindowManager({ chromeApi }) {
  return {
    async createManagedSessionWindow({ urls, focused }) {
      return chromeApi.windows.create({
        url: urls,
        focused: Boolean(focused)
      });
    }
  };
}

module.exports = {
  createWindowManager
};
