// png-loader.mjs

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".png")) {
    return {
      format: "module",
      source: 'export default "";',
      shortCircuit: true,
    };
  }
  return defaultLoad(url, context);
}
