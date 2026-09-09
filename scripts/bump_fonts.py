import os
import re

def bump_fonts(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # CSS font-size: Xpx
    def repl_css(m):
        return f"font-size: {int(m.group(1)) + 2}px"
    content = re.sub(r'font-size:\s*(\d+)px', repl_css, content)

    # React inline fontSize: X
    def repl_jsx(m):
        return f"fontSize: {int(m.group(1)) + 2}"
    content = re.sub(r'fontSize:\s*(\d+)', repl_jsx, content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for root, _, files in os.walk('dashboard/src'):
    for file in files:
        if file.endswith('.css') or file.endswith('.jsx') or file.endswith('.js'):
            bump_fonts(os.path.join(root, file))

print('Fonts bumped!')
