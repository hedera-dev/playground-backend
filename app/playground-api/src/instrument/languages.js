const SIDECAR = '.playground-transactions.json';

/** Index to prepend at: after a shebang line if present, else 0. */
function prepend_index(source) {
    if (source.startsWith('#!')) {
        const nl = source.indexOf('\n');
        if (nl !== -1) return nl + 1;
    }
    return 0;
}

// ─── JavaScript ───────────────────────────────────────────────────────────────

const JS_QUERY = `
(call_expression
  function: (member_expression
    property: (property_identifier) @method (#eq? @method "execute"))) @call
`;

const JS_HELPER = `const __pgFs = require("fs");
function __pgRecord(p) {
  return Promise.resolve(p).then(function (r) {
    try {
      if (r != null && r.transactionId != null) {
        __pgFs.appendFileSync(${JSON.stringify(SIDECAR)},
          JSON.stringify({ id: String(r.transactionId), type: (r.constructor && r.constructor.name) || null }) + "\\n");
      }
    } catch (e) {}
    return r;
  });
}
`;

const javascript = {
    grammar: 'javascript',
    query: JS_QUERY,
    open: '__pgRecord(',
    close: ')',
    plan_helper(root, source) {
        return [{ index: prepend_index(source), text: JS_HELPER + '\n', order: 2 }];
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
            { index: lists[0].endIndex - 1, text: GO_IMPORTS, order: 2 },
            { index: source.length, text: '\n' + GO_HELPER + '\n', order: 2 },
        ];
    },
};

// ─── Java ─────────────────────────────────────────────────────────────────────
// No top-level functions: the helper is a static method injected into the first class body.
// Fully-qualified types avoid touching the user's imports. Reflection reads transactionId.

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
    plan_helper(root, source, grammar, query_nodes) {
        const bodies = query_nodes(
            grammar,
            root,
            '(class_declaration body: (class_body) @body)',
            'body'
        );
        if (bodies.length === 0) return null; // no class to host the helper
        return [{ index: bodies[0].endIndex - 1, text: JAVA_HELPER, order: 2 }];
    },
};

// ─── Rust ─────────────────────────────────────────────────────────────────────
// We wrap the `…execute(…).await` expression (the awaited Result), keeping any `?` outside.
// No reflection in Rust: downcast via std::any::Any to the SDK's TransactionResponse (crate
// `hedera`); non-transaction executes downcast to None and are ignored.

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
    plan_helper(root, source) {
        return [{ index: prepend_index(source), text: RUST_HELPER + '\n', order: 2 }];
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
