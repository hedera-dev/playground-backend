const Logger = require('logplease');
const { get_parser } = require('./parser');
const { config_for } = require('./languages');

const logger = Logger.create('instrument');

/** Runs a tree-sitter query and returns the nodes captured under `capture`. */
function query_nodes(grammar, root, query_string, capture) {
    return grammar
        .query(query_string)
        .captures(root)
        .filter(c => c.name === capture)
        .map(c => c.node);
}

/**
 * Rewrites the user's source so that every executed transaction's id is captured into a sidecar file
 *
 * Best-effort: on any failure (unsupported language, parse error, no place to put the helper) it returns the ORIGINAL source unchanged. The cost feature must never break the user's run.
 *
 * @param {string} language Language string from the request (e.g. "javascript", "go")
 * @param {string} source   The user's code
 * @returns {Promise<string>} Instrumented source, or the original on any failure
 */
async function instrument(language, source) {
    const config = config_for(language);
    if (!config || typeof source !== 'string' || source.length === 0) {
        return source;
    }

    try {
        const { parser, language: grammar } = await get_parser(config.grammar);
        const tree = parser.parse(source);
        const root = tree.rootNode;

        const calls = query_nodes(grammar, root, config.query, 'call');
        if (calls.length === 0) {
            return source; // no transactions executed → nothing to instrument
        }

        // Helper placement is computed on the original tree. If the language can't place it, abort: never wrap a helper that won't exist.
        const helper_insertions = config.plan_helper(root, source, grammar, query_nodes);
        if (helper_insertions == null) {
            return source;
        }

        // Wrap each call: open before, close after.
        const insertions = [...helper_insertions];
        for (const node of calls) {
            insertions.push({ index: node.startIndex, text: config.open, order: 0 });
            insertions.push({ index: node.endIndex, text: config.close, order: 1 });
        }

        // Apply in descending index order so earlier (lower) indices stay valid; this makes wrapping correct even for nested calls without recomputing offsets.
        insertions.sort((a, b) => b.index - a.index || (b.order || 0) - (a.order || 0));

        let out = source;
        for (const ins of insertions) {
            out = out.slice(0, ins.index) + ins.text + out.slice(ins.index);
        }

        return out;
    } catch (e) {
        logger.warn(`instrument failed for ${language}, running original: ${e.message}`);
        return source;
    }
}

module.exports = { instrument };
