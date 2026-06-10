const path = require('path');
const Parser = require('web-tree-sitter');

// tree-sitter-wasms ships prebuilt grammar wasm files under out/.
const WASM_DIR = path.join(
    path.dirname(require.resolve('tree-sitter-wasms/package.json')),
    'out'
);

let init_promise = null;
const language_cache = new Map();

/**
 * Returns a parser configured for the given grammar (e.g. "javascript", "go").
 * web-tree-sitter init and grammar loading happen once and are cached.
 */
async function get_parser(grammar) {
    if (!init_promise) {
        init_promise = Parser.init();
    }
    await init_promise;

    if (!language_cache.has(grammar)) {
        const wasm_path = path.join(WASM_DIR, `tree-sitter-${grammar}.wasm`);
        language_cache.set(grammar, await Parser.Language.load(wasm_path));
    }

    const language = language_cache.get(grammar);
    const parser = new Parser();
    parser.setLanguage(language);
    return { parser, language };
}

module.exports = { get_parser };
