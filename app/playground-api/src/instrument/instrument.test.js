const { test } = require('node:test');
const assert = require('node:assert');
const { instrument } = require('./index');

const count = (haystack, needle) => haystack.split(needle).length - 1;

// ─── JavaScript (the validated path) ───────────────────────────────────────────

test('js: wraps an execute call and appends the helper', async () => {
    const src = [
        'const { Client } = require("@hiero-ledger/sdk");',
        'async function main() {',
        '  const resp = await new AccountCreateTransaction().execute(client);',
        '}',
        'main();',
    ].join('\n');

    const out = await instrument('javascript', src);

    assert.match(out, /function __pgRecord\(p\)/, 'helper is injected');
    assert.match(
        out,
        /__pgRecord\(new AccountCreateTransaction\(\)\.execute\(client\)\)/,
        'the execute call is wrapped'
    );
});

test('js: does not wrap non-execute calls (getReceipt)', async () => {
    const src = [
        'async function main() {',
        '  const resp = await tx.execute(client);',
        '  const receipt = await resp.getReceipt(client);',
        '}',
        'main();',
    ].join('\n');

    const out = await instrument('javascript', src);

    assert.ok(out.includes('resp.getReceipt(client)'), 'getReceipt is left untouched');
    assert.ok(!out.includes('__pgRecord(resp.getReceipt'), 'getReceipt is not wrapped');
    assert.strictEqual(count(out, '__pgRecord('), 2, 'one wrap call + the helper definition');
});

test('js: wraps multiple and chained execute calls', async () => {
    const src = [
        'async function main() {',
        '  await new AccountCreateTransaction().execute(client);',
        '  await tx.freezeWith(client).execute(client);',
        '}',
        'main();',
    ].join('\n');

    const out = await instrument('javascript', src);

    // 2 wrapped call sites + 1 occurrence in the helper definition = 3
    assert.strictEqual(count(out, '__pgRecord('), 3, 'both execute calls wrapped');
    assert.match(out, /__pgRecord\(tx\.freezeWith\(client\)\.execute\(client\)\)/);
});

test('js: output is syntactically valid javascript', async () => {
    const src = [
        'const { Client } = require("@hiero-ledger/sdk");',
        'async function main() {',
        '  const resp = await new AccountCreateTransaction().execute(client);',
        '  console.log(resp);',
        '}',
        'main();',
    ].join('\n');

    const out = await instrument('javascript', src);
    // new Function parses the body and throws on a syntax error (does not execute it).
    assert.doesNotThrow(() => new Function(out));
});

test('js: source without any execute call is returned unchanged', async () => {
    const src = 'const x = 1;\nconsole.log(x);\n';
    const out = await instrument('javascript', src);
    assert.strictEqual(out, src);
});

test('js: helper is injected exactly once', async () => {
    const src = [
        'async function main() {',
        '  await a.execute(c);',
        '  await b.execute(c);',
        '}',
        'main();',
    ].join('\n');
    const out = await instrument('javascript', src);
    assert.strictEqual(count(out, 'function __pgRecord(p)'), 1);
});

test('js: single-expression source is wrapped and stays valid (helper appended, hoisted)', async () => {
    const out = await instrument('javascript', 'tx.execute(client)');
    assert.doesNotThrow(() => new Function(out), 'valid JS');
    assert.match(out, /__pgRecord\(tx\.execute\(client\)\)/, 'call wrapped');
    assert.ok(
        out.indexOf('__pgRecord(tx') < out.indexOf('function __pgRecord'),
        'helper is appended after the call (relies on function hoisting)'
    );
});

test('js: a synchronous execute() keeps its value (not turned into a Promise)', async () => {
    // The query matches `.execute()` by name only, so a non-Hedera synchronous execute must
    // not be forced async. Run the instrumented output with a sync, non-thenable execute().
    const out = await instrument('javascript', 'function run(obj) { return obj.execute(); }');
    const run = new Function('obj', `${out}\nreturn run(obj);`);
    const result = run({ execute: () => 42 });
    assert.strictEqual(result, 42, 'sync return value preserved');
});

test('js: helper is appended, preserving user line numbers', async () => {
    const src = 'async function main() {\n  await tx.execute(client);\n}\nmain();';
    const out = await instrument('javascript', src);
    assert.ok(out.startsWith('async function main()'), 'user code still starts at line 1');
    assert.ok(
        out.indexOf('async function main') < out.indexOf('function __pgRecord'),
        'helper sits after the user code'
    );
});

// ─── Passthrough / safety ───────────────────────────────────────────────────────

test('unsupported language is returned unchanged', async () => {
    const src = 'print("hello")\n';
    const out = await instrument('python', src);
    assert.strictEqual(out, src);
});

test('empty source is returned unchanged', async () => {
    assert.strictEqual(await instrument('javascript', ''), '');
});

// ─── Per-language transform tests ──────────────────────────────────────────────
// These assert the rewrite SHAPE only (input source → output source). They do NOT
// prove the result compiles/runs: validate Go/Java/Rust against a real package build.

// ── Go ──
test('go: wraps Execute (incl. chained), aliases imports, appends helper, leaves the rest', async () => {
    const src = [
        'package main',
        'import (',
        '\t"fmt"',
        '\thedera "github.com/hiero-ledger/hiero-sdk-go/v2/sdk"',
        ')',
        'func main() {',
        '\tresp, _ := txSigned.Execute(client)',
        '\treceipt, _ := resp.GetReceipt(client)',
        '\ttxResp, _ := contract.Sign(key).Execute(client)',
        '\tfmt.Println(resp, receipt, txResp)',
        '}',
    ].join('\n');

    const out = await instrument('go', src);

    assert.match(out, /__pgRecord\(txSigned\.Execute\(client\)\)/, 'plain Execute wrapped');
    assert.match(
        out,
        /__pgRecord\(contract\.Sign\(key\)\.Execute\(client\)\)/,
        'chained Sign().Execute() wrapped'
    );
    assert.ok(out.includes('resp.GetReceipt(client)'), 'GetReceipt left untouched');
    assert.ok(!out.includes('__pgRecord(resp.GetReceipt'), 'GetReceipt not wrapped');
    assert.match(out, /__pgreflect "reflect"/, 'reflect imported under alias');
    assert.match(out, /func __pgRecord\[T any\]/, 'generic helper appended');
});

test('go: without a grouped import block, returns unchanged', async () => {
    const src = ['package main', 'func main() {', '\ttx.Execute(client)', '}'].join('\n');
    const out = await instrument('go', src);
    assert.strictEqual(out, src, 'cannot place imports → no instrumentation');
});

// ── Java ──
test('java: wraps execute, injects a static helper, leaves non-execute untouched', async () => {
    const src = [
        'import com.hedera.hashgraph.sdk.*;',
        'class Main {',
        '    public static void main(String[] args) throws Exception {',
        '        var resp = tx.execute(client);',
        '        var receipt = resp.getReceipt(client);',
        '        var resp2 = tx2.execute(client);',
        '    }',
        '}',
    ].join('\n');

    const out = await instrument('java', src);

    assert.strictEqual(count(out, '__pgRecord(tx'), 2, 'both execute calls wrapped');
    assert.match(out, /__pgRecord\(tx\.execute\(client\)\)/);
    assert.ok(out.includes('resp.getReceipt(client)'), 'getReceipt left untouched');
    assert.ok(!out.includes('__pgRecord(resp.getReceipt'), 'getReceipt not wrapped');
    assert.match(out, /private static <T> T __pgRecord\(T r\)/, 'static helper injected');
});

test('java: without a class, returns unchanged', async () => {
    const src = 'int x = tx.execute(client);\n';
    const out = await instrument('java', src);
    assert.strictEqual(out, src, 'no class body to host the helper → no instrumentation');
});

test('java: leaves statement-position (void) execute unwrapped', async () => {
    const src = [
        'class Main {',
        '    public static void main(String[] a) throws Exception {',
        '        executor.execute(runnable);',
        '        var resp = tx.execute(client);',
        '    }',
        '}',
    ].join('\n');

    const out = await instrument('java', src);

    assert.ok(out.includes('executor.execute(runnable);'), 'void statement execute left as-is');
    assert.ok(!out.includes('__pgRecord(executor.execute'), 'void statement execute not wrapped');
    assert.match(out, /__pgRecord\(tx\.execute\(client\)\)/, 'assigned execute wrapped');
});

test('java: injects the helper into every class', async () => {
    const src = [
        'class A { void m() throws Exception { var x = t.execute(c); } }',
        'class B { void n() throws Exception { var y = u.execute(c); } }',
    ].join('\n');

    const out = await instrument('java', src);

    assert.strictEqual(
        count(out, 'private static <T> T __pgRecord(T r)'),
        2,
        'helper injected into both classes'
    );
});

test('java: injects the helper into an interface (default method)', async () => {
    const src = [
        'interface Svc {',
        '    default void go(Tx tx, Client c) throws Exception {',
        '        var resp = tx.execute(c);',
        '    }',
        '}',
    ].join('\n');

    const out = await instrument('java', src);

    assert.match(out, /private static <T> T __pgRecord\(T r\)/, 'helper injected into interface');
    assert.match(out, /__pgRecord\(tx\.execute\(c\)\)/, 'execute wrapped');
});

test('java: injects the helper into a record', async () => {
    const src = [
        'record Job(int n) {',
        '    void run(Tx tx, Client c) throws Exception { var r = tx.execute(c); }',
        '}',
    ].join('\n');

    const out = await instrument('java', src);

    assert.match(out, /private static <T> T __pgRecord\(T r\)/, 'helper injected into record');
    assert.match(out, /__pgRecord\(tx\.execute\(c\)\)/, 'execute wrapped');
});

test('java: an execute() only inside an enum is left uninstrumented (no out-of-scope helper)', async () => {
    const src = [
        'enum E {',
        '    A;',
        '    void run(Tx tx, Client c) throws Exception { var r = tx.execute(c); }',
        '}',
    ].join('\n');

    const out = await instrument('java', src);
    assert.strictEqual(out, src, 'enum has no helper host → execute not wrapped, source unchanged');
});

test('java: enum execute is skipped while a class execute in the same file is wrapped', async () => {
    const src = [
        'class Main { void m(Tx tx, Client c) throws Exception { var a = tx.execute(c); } }',
        'enum E { A; void r(Tx tx, Client c) throws Exception { var b = tx.execute(c); } }',
    ].join('\n');

    const out = await instrument('java', src);

    assert.strictEqual(count(out, '__pgRecord(tx.execute(c))'), 1, 'only the class execute is wrapped');
    assert.strictEqual(
        count(out, 'private static <T> T __pgRecord(T r)'),
        1,
        'helper lives only in the class, never the enum'
    );
});

test('java: execute inside an anonymous class reuses the enclosing class helper', async () => {
    const src = [
        'class Main {',
        '    void m(Tx tx, Client c) {',
        '        Runnable r = new Runnable() {',
        '            public void run() {',
        '                try { var x = tx.execute(c); } catch (Exception e) {}',
        '            }',
        '        };',
        '    }',
        '}',
    ].join('\n');

    const out = await instrument('java', src);

    assert.match(out, /__pgRecord\(tx\.execute\(c\)\)/, 'execute in anonymous class wrapped');
    assert.strictEqual(
        count(out, 'private static <T> T __pgRecord(T r)'),
        1,
        'helper injected only in the named class, not the anonymous body'
    );
});

// ── Rust ──
test('rust: wraps awaited execute (? kept outside), appends helper, leaves the rest', async () => {
    const src = [
        'use hedera::*;',
        '#[tokio::main]',
        'async fn main() -> anyhow::Result<()> {',
        '    let resp = tx.execute(&client).await?;',
        '    let receipt = resp.get_receipt(&client).await?;',
        '    let resp2 = flow.execute(&client).await.unwrap();',
        '    Ok(())',
        '}',
    ].join('\n');

    const out = await instrument('rust', src);

    assert.match(
        out,
        /__pg_record\(tx\.execute\(&client\)\.await\)\?/,
        'awaited execute wrapped with ? outside'
    );
    assert.match(
        out,
        /__pg_record\(flow\.execute\(&client\)\.await\)\.unwrap\(\)/,
        'awaited execute without ? also wrapped'
    );
    assert.ok(!out.includes('__pg_record(resp.get_receipt'), 'get_receipt not wrapped');
    assert.match(out, /fn __pg_record<T: 'static, E>/, 'helper appended');
});

test('rust: helper is appended, preserving user line numbers', async () => {
    const src = [
        'use hedera::*;',
        '#[tokio::main]',
        'async fn main() -> anyhow::Result<()> {',
        '    let r = tx.execute(&client).await?;',
        '    Ok(())',
        '}',
    ].join('\n');

    const out = await instrument('rust', src);

    assert.ok(out.startsWith('use hedera::*;'), 'user code still starts at line 1');
    assert.ok(
        out.indexOf('async fn main') < out.indexOf('fn __pg_record'),
        'helper sits after the user code'
    );
});
