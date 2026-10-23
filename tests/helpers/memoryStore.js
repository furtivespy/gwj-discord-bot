function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get: (key) => data.get(String(key)),
    set(key, value) {
      data.set(String(key), value);
      return this;
    },
    has: (key) => data.has(String(key)),
    ensure(key, defaultValue) {
      const stringKey = String(key);
      if (!data.has(stringKey)) {
        data.set(
          stringKey,
          typeof defaultValue === "function" ? defaultValue() : { ...defaultValue }
        );
      }
      return data.get(stringKey);
    },
    data,
  };
}

export { memoryStore };
