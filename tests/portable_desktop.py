"""Primary Linux desktop distribution test: no Node, npm, or server process.

Maintainer prerequisites: Python Playwright and /usr/bin/chromium. The tested
application itself needs neither. Managed Chromium blocks file:// navigation;
one intercepted URL supplies the exact standalone HTML without an HTTP server.
"""
from pathlib import Path
from zipfile import ZipFile
import json
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'artifacts' / 'Commonplace.html'
URL = 'http://127.0.0.1:39999/Commonplace.html'  # No service listens here.

with ZipFile(ROOT / 'artifacts' / 'Commonplace-portable.zip') as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == {'Commonplace/Commonplace.html', 'Commonplace/START-HERE.txt'}
    assert archive.read('Commonplace/Commonplace.html') == HTML.read_bytes()
    assert archive.read('Commonplace/START-HERE.txt') == (ROOT / 'PORTABLE-README.txt').read_bytes()
standalone = HTML.read_text()
assert '<script type="module"' not in standalone
assert '<script src=' not in standalone
assert '<link rel="stylesheet"' not in standalone

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    errors, extra_requests = [], []

    def desktop():
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, is_mobile=False, has_touch=False)
        context.route(URL, lambda route: route.fulfill(status=200, content_type='text/html', body=standalone))
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: extra_requests.append(r.url) if r.url.startswith(('http:', 'https:')) and r.url != URL else None)
        page.goto(URL)
        context.set_offline(True)
        expect(page.locator('.source-card')).to_have_count(9)
        return context, page

    context, page = desktop()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    expect(page.locator('.sidebar')).to_be_visible()
    # Native Linux desktop keyboard shortcut; no developer UI is involved.
    page.keyboard.press('Control+k')
    expect(page.locator('#search')).to_be_focused()
    page.keyboard.type('"public space" library')
    assert 0 < page.locator('.source-card').count() < 9
    page.locator('#clear-search').click()

    imported = '# Linux desktop notes\n\nExact words from my own document.\nSecond line of the same passage.\n\n<img src=x onerror="window.injected=true">\n\nAnother thought worth keeping.'
    page.locator('#file-input').set_input_files({'name': 'desktop-notes.md', 'mimeType': 'text/markdown', 'buffer': imported.encode()})
    expect(page.locator('.source-card')).to_have_count(1)
    page.get_by_role('button', name='Read Linux desktop notes', exact=True).click()
    expect(page.locator('#reader-body')).to_contain_text('<img src=x')
    assert page.locator('#reader-body img').count() == 0
    assert page.evaluate('window.injected') is None
    page.locator('.source-paragraph').first.get_by_role('button').click()
    # Prevent accidental duplicate quotes even with a repeated desktop click.
    page.locator('.source-paragraph').first.get_by_role('button').click()
    expect(page.locator('#reader-pin-count')).to_have_text('1 passage in your brief')
    state = page.evaluate("JSON.parse(localStorage.getItem('driver.commonplace.v1'))")
    pin = state['pins'][0]
    assert pin['line'] == 3 and pin['endLine'] == 4
    assert pin['quote'] == '\n'.join(imported.split('\n')[2:4])
    page.keyboard.press('Escape')
    expect(page.locator('#reader')).not_to_be_visible()
    page.locator('#nav-brief').click()
    page.locator('[data-note]').fill('My Linux desktop observation — separate from the source.')
    page.locator('#brief-title').fill('My desktop research')
    page.reload()
    page.locator('#nav-brief').click()
    expect(page.locator('[data-note]')).to_have_value('My Linux desktop observation — separate from the source.')
    expect(page.locator('#brief-title')).to_have_value('My desktop research')
    # The saved source title returns to the exact paragraph on desktop.
    page.locator('.pin-source').click()
    expect(page.locator('#paragraph-3')).to_be_visible()
    page.keyboard.press('Escape')

    with page.expect_download() as result:
        page.locator('#export-brief').click()
    brief = Path(result.value.path()).read_text()
    assert '# My desktop research' in brief
    assert '> Exact words from my own document.\n> Second line of the same passage.' in brief
    assert '**Your note:** My Linux desktop observation' in brief
    assert 'desktop-notes.md' in brief and 'lines 3–4' in brief
    page.locator('#about-button').click()
    with page.expect_download() as result:
        page.locator('#export-workspace').click()
    backup = Path(result.value.path()).read_bytes()
    assert json.loads(backup)['pins'][0]['quote'] == pin['quote']

    fresh_context, restored = desktop()
    restored.locator('#file-input').set_input_files({'name': 'workspace-backup.json', 'mimeType': 'application/json', 'buffer': backup})
    expect(restored.locator('#library-count')).to_have_text('10')
    expect(restored.locator('#brief-count')).to_have_text('1')
    restored.locator('#nav-brief').click()
    expect(restored.locator('[data-note]')).to_have_value('My Linux desktop observation — separate from the source.')
    restored.locator('.pin-source').click()
    expect(restored.locator('#reader-title')).to_have_text('Linux desktop notes')
    expect(restored.locator('#paragraph-3 p')).to_have_text(pin['quote'])
    assert not errors, errors
    assert not extra_requests, extra_requests
    browser.close()

print('PASS: packaged Linux desktop HTML and guide match the committed distribution.')
print('PASS: desktop import, exact citations, notes, reload persistence, Markdown export, JSON backup/restore, keyboard navigation, duplicate prevention, and inert HTML imports.')
print('PASS: zero JavaScript errors, zero external requests, no module loader, and no Node/npm/server used to run the app.')
print('LIMIT: managed browser blocks file://; direct file-manager opening and Firefox remain unverified.')
