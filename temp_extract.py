from pathlib import Path

data = Path('src/index.ts').read_text(encoding='utf-8')
marker = "const js = `"
start = data.index(marker) + len(marker)
i = start
out = []
escaped = False
while i < len(data):
    ch = data[i]
    out.append(ch)
    if ch == '\\':
        escaped = not escaped
    else:
        if ch == '`' and not escaped:
            break
        escaped = False
    i += 1
else:
    raise RuntimeError('No closing backtick found')
content = ''.join(out[:-1])  # exclude the terminating backtick itself
Path('temp_eval.js').write_text(f"const js = `{content}`;\nconsole.log(js);\n", encoding='utf-8')
