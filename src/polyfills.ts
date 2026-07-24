// Safari 14 and older Android WebViews do not implement Array.prototype.at.
// hls.js and a few lazy player chunks can use it after a long-lived tab is
// restored, so install the tiny compatibility primitive before React boots.
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    configurable: true,
    writable: true,
    value(this: unknown[], index: number) {
      const length = this.length >>> 0;
      const normalized = Math.trunc(Number(index) || 0);
      const position = normalized < 0 ? length + normalized : normalized;
      return position < 0 || position >= length ? undefined : this[position];
    },
  });
}
