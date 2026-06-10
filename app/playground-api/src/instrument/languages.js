const SIDECAR = '.playground-transactions.json';

// ─── JavaScript ───────────────────────────────────────────────────────────────

const JS_QUERY = `
(call_expression
  function: (member_expression
    property: (property_identifier) @method (#eq? @method "execute"))) @call
`;

// Wraps only thenables: a synchronous `.execute()` must keep
// returning its value, not get turned into a Promise.
const JS_HELPER = `function __pgRecord(p) {
  function __pgWrite(r) {
    try {
      if (r != null && r.transactionId != null) {
        require("fs").appendFileSync(${JSON.stringify(SIDECAR)},
          JSON.stringify({ id: String(r.transactionId), type: (r.constructor && r.constructor.name) || null }) + "\\n");
      }
    } catch (e) {}
    return r;
  }
  return p && typeof p.then === "function" ? p.then(__pgWrite) : __pgWrite(p);
}
`;

const javascript = {
    grammar: 'javascript',
    query: JS_QUERY,
    open: '__pgRecord(',
    close: ')',
    // Append at EOF (function is hoisted) to keep user line numbers intact; order 2 keeps the
    // helper outside a call that closes exactly at EOF.
    plan_helper(root, source) {
        return [{ index: source.length, text: '\n' + JS_HELPER, order: 2 }];
    },
};

// ─── Go ─────────────────────────────────────────────────────────────────────--
// Method is exported (`Execute`). Helper imports os/reflect/fmt under aliases (Go allows the
// same package imported twice under different names, so this never clashes with user imports)
// and is appended at end of file. Generic over the return type to keep the caller's type.

const GO_QUERY = `
(call_expression
  function: (selector_expression
    field: (field_identifier) @method (#eq? @method "Execute"))) @call
`;

const GO_IMPORTS = `
\t__pgos "os"
\t__pgreflect "reflect"
\t__pgfmt "fmt"
`;

const GO_HELPER = `
func __pgRecord[T any](resp T, err error) (T, error) {
\tif err == nil {
\t\t__pgRecordValue(resp)
\t}
\treturn resp, err
}

func __pgRecordValue(v interface{}) {
\tdefer func() { recover() }()
\trv := __pgreflect.ValueOf(v)
\tif rv.Kind() == __pgreflect.Ptr {
\t\trv = rv.Elem()
\t}
\tif rv.Kind() != __pgreflect.Struct {
\t\treturn
\t}
\tf := rv.FieldByName("TransactionID")
\tif !f.IsValid() {
\t\treturn
\t}
\tid := __pgfmt.Sprintf("%v", f.Interface())
\tfile, ferr := __pgos.OpenFile(${JSON.stringify(SIDECAR)}, __pgos.O_APPEND|__pgos.O_CREATE|__pgos.O_WRONLY, 0644)
\tif ferr != nil {
\t\treturn
\t}
\tdefer file.Close()
\tfile.WriteString("{\\"id\\":\\"" + id + "\\",\\"type\\":\\"TransactionResponse\\"}\\n")
}
`;

const go = {
    grammar: 'go',
    query: GO_QUERY,
    open: '__pgRecord(',
    close: ')',
    plan_helper(root, source, grammar, query_nodes) {
        const lists = query_nodes(grammar, root, '(import_spec_list) @list', 'list');
        if (lists.length === 0) return null; // no grouped import block → don't instrument
        return [
            { index: lists[0].endIndex - 1, text: GO_IMPORTS, order: -1 },
            { index: source.length, text: '\n' + GO_HELPER + '\n', order: -1 },
        ];
    },
};

// ─── Java ─────────────────────────────────────────────────────────────────────
// No top-level functions: the static helper is injected into every named type body that can host
// one (class/record class_body, interface_body); fully-qualified types avoid touching imports.
// No compile fallback in Java, so filter_call wraps only an execute() with a helper-hosting
// ancestor — enum bodies and anything else stay uninstrumented (no out-of-scope __pgRecord).

const JAVA_QUERY = `
(method_invocation
  name: (identifier) @method (#eq? @method "execute")) @call
`;

const JAVA_HELPER = `
    @SuppressWarnings("unchecked")
    private static <T> T __pgRecord(T r) {
        try {
            if (r != null && r.getClass().getSimpleName().equals("TransactionResponse")) {
                java.lang.reflect.Field __pgF = r.getClass().getField("transactionId");
                Object __pgId = __pgF.get(r);
                if (__pgId != null) {
                    java.nio.file.Files.write(
                        java.nio.file.Paths.get(${JSON.stringify(SIDECAR)}),
                        ("{\\"id\\":\\"" + __pgId.toString() + "\\",\\"type\\":\\"TransactionResponse\\"}\\n")
                            .getBytes(java.nio.charset.StandardCharsets.UTF_8),
                        java.nio.file.StandardOpenOption.CREATE,
                        java.nio.file.StandardOpenOption.APPEND);
                }
            }
        } catch (Throwable __pgE) {}
        return r;
    }
`;

const java = {
    grammar: 'java',
    query: JAVA_QUERY,
    open: '__pgRecord(',
    close: ')',
    // Wrap an execute() only when a helper-hosting type body is one of its ancestors; otherwise
    // __pgRecord wouldn't be in scope and the file wouldn't compile. Also skips statement-position
    // void execute() (e.g. ExecutorService.execute).
    filter_call(node) {
        if (node.parent && node.parent.type === 'expression_statement') return false;
        for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
            if (ancestor.type === 'interface_body') return true;
            if (ancestor.type === 'class_body') {
                // A named class/record body hosts the helper; an anonymous one (inside an
                // object_creation_expression) relies on an outer named host, so keep climbing.
                if (
                    ancestor.parent &&
                    ancestor.parent.type !== 'object_creation_expression'
                )
                    return true;
            }
            // Reached an enum body without finding a host first → no helper here, don't wrap.
            if (ancestor.type === 'enum_body') return false;
        }
        return false;
    },
    plan_helper(root, source, grammar, query_nodes) {
        // Inject into every named class/record body and every interface body. Anonymous class
        // bodies are skipped: they can't host the static helper and their enclosing named type
        // already has it.
        const bodies = query_nodes(
            grammar,
            root,
            '[(class_body) (interface_body)] @body',
            'body'
        ).filter(
            body =>
                body.type === 'interface_body' ||
                (body.parent &&
                    body.parent.type !== 'object_creation_expression')
        );
        if (bodies.length === 0) return null; // no type body to host the helper
        return bodies.map(body => ({
            index: body.endIndex - 1,
            text: JAVA_HELPER,
            order: -1,
        }));
    },
};

// ─── Rust ─────────────────────────────────────────────────────────────────────
// We wrap the `…execute(…).await` expression (the awaited Result), keeping any `?` outside.
// No reflection in Rust: downcast via std::any::Any to the SDK's TransactionResponse (crate
// `hedera`); non-transaction executes downcast to None and are ignored. The helper fn is
// appended at EOF (Rust items are order-independent) so the user's line numbers stay intact.

const RUST_QUERY = `
(await_expression
  (call_expression
    function: (field_expression
      field: (field_identifier) @method (#eq? @method "execute")))) @call
`;

const RUST_HELPER = `fn __pg_record<T: 'static, E>(r: Result<T, E>) -> Result<T, E> {
    if let Ok(ref __pg_v) = r {
        if let Some(__pg_tr) = (__pg_v as &dyn std::any::Any).downcast_ref::<hedera::TransactionResponse>() {
            use std::io::Write as _;
            if let Ok(mut __pg_f) = std::fs::OpenOptions::new().create(true).append(true).open(${JSON.stringify(SIDECAR)}) {
                let _ = writeln!(__pg_f, "{{\\"id\\":\\"{}\\",\\"type\\":\\"TransactionResponse\\"}}", __pg_tr.transaction_id);
            }
        }
    }
    r
}
`;

const rust = {
    grammar: 'rust',
    query: RUST_QUERY,
    open: '__pg_record(',
    close: ')',
    // order 2 (> the wrap's close=1): see the JavaScript helper — keeps the appended helper
    // after a wrap that closes exactly at EOF.
    plan_helper(root, source) {
        return [{ index: source.length, text: '\n' + RUST_HELPER, order: 2 }];
    },
};

// ─── Registry ───────────────────────────────────────────────────────────────--

const CONFIGS = { javascript, go, java, rust };

const ALIASES = {
    javascript: 'javascript',
    js: 'javascript',
    node: 'javascript',
    'node-js': 'javascript',
    'node-javascript': 'javascript',
    go: 'go',
    golang: 'go',
    go1: 'go',
    java: 'java',
    rust: 'rust',
    rs: 'rust',
};

/** Returns the instrumentation config for a language string, or null if unsupported. */
function config_for(language) {
    if (!language) return null;
    const key = ALIASES[language.toLowerCase()];
    return key ? CONFIGS[key] : null;
}

module.exports = { config_for, SIDECAR };
