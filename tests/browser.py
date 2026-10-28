"""End-to-end checks. Run with the app on port 3000 and Python Playwright installed.
Uses the system Chromium; no browser downloads or third-party web requests.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright, expect

ARTIFACTS = Path(__file__).resolve().parents[1] / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1050}, device_scale_factor=1)
    page = context.new_page()
    errors, outside = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: outside.append(req.url) if not req.url.startswith(('http://127.0.0.1:3000/', 'data:', 'blob:')) else None)
    page.goto('http://127.0.0.1:3000/')
    expect(page.locator('.source-card')).to_have_count(9)
    page.screenshot(path=str(ARTIFACTS / 'commonplace-desktop.png'), full_page=True)

    # Read and save the precise paragraph, with an independently verified citation.
    page.get_by_role('button', name='Read The city after dark', exact=True).click()
    expect(page.locator('#reader')).to_be_visible()
    expect(page.locator('.related-card')).to_have_count(3)
    quote = page.locator('.source-paragraph').nth(2).locator('p').inner_text()
    line = int(page.locator('.source-paragraph').nth(2).locator('.line-label').inner_text())
    page.locator('.source-paragraph').nth(2).get_by_role('button').click()
    expect(page.locator('#reader-pin-count')).to_have_text('1 passage in your brief')
    page.locator('.source-paragraph').nth(2).get_by_role('button').click()
    expect(page.locator('#reader-pin-count')).to_have_text('1 passage in your brief')
    stored = page.evaluate("JSON.parse(localStorage.getItem('driver.commonplace.v1'))")
    pin = stored['pins'][0]
    assert pin['quote'] == quote and pin['line'] == line
    doc = next(d for d in stored['docs'] if d['id'] == pin['docId'])
    assert '\n'.join(doc['content'].split('\n')[pin['line']-1:pin['endLine']]) == quote
    page.screenshot(path=str(ARTIFACTS / 'commonplace-reader.png'), full_page=True)
    page.get_by_role('button', name='View your brief').click()
    page.locator('[data-note]').fill('My observation: an open door can matter more than a landmark.')
    page.locator('#brief-title').fill('Spaces that let us stay')
    page.reload()
    page.locator('#nav-brief').click()
    expect(page.locator('[data-note]')).to_have_value('My observation: an open door can matter more than a landmark.')
    expect(page.locator('#brief-title')).to_have_value('Spaces that let us stay')
    page.screenshot(path=str(ARTIFACTS / 'commonplace-brief.png'), full_page=True)
    with page.expect_download() as downloaded:
        page.locator('#export-brief').click()
    output = Path(downloaded.value.path()).read_text()
    assert '# Spaces that let us stay' in output
    assert quote in output and f'lines {pin["line"]}–{pin["endLine"]}' in output
    assert '**Your note:** My observation' in output and 'Fictional sample document' in output

    # Search requires both terms, supports exact phrases, and has a real empty state.
    page.locator('#nav-library').click()
    page.locator('#search').fill('"public space" library')
    assert 0 < page.locator('.source-card').count() < 9
    assert page.locator('.search-snippet mark').count() > 0
    page.locator('#search').fill('qzxthisdoesnotexist')
    expect(page.locator('#empty-library')).to_be_visible()
    page.get_by_role('button', name='Show everything').click()
    expect(page.locator('.source-card')).to_have_count(9)
    page.get_by_role('button', name='Design & attention').click()
    expect(page.locator('.source-card')).to_have_count(3)
    page.get_by_role('button', name='Everything', exact=False).click()
    page.get_by_role('button', name='List view', exact=True).click()
    expect(page.locator('#library-grid')).to_have_class('library-grid list-layout')
    page.get_by_role('button', name='Grid view', exact=True).click()

    # Import hostile markup: display it literally, retain its provenance, never execute it.
    hostile = '# My source\n\nA needle in a private document.\n\n<img src=x onerror="window.compromised=true">\n\nA second exact paragraph.'
    page.locator('#file-input').set_input_files({'name': 'private-note.md', 'mimeType': 'text/markdown', 'buffer': hostile.encode()})
    expect(page.locator('.source-card')).to_have_count(1)
    page.get_by_role('button', name='Read My source', exact=True).click()
    expect(page.locator('#reader-body')).to_contain_text('<img src=x')
    assert page.evaluate('window.compromised') is None
    assert page.locator('#reader-body img').count() == 0
    page.locator('.source-paragraph').first.get_by_role('button').click()
    page.locator('#reader-close').click()
    page.locator('#file-input').set_input_files({'name': 'private-note.md', 'mimeType': 'text/markdown', 'buffer': hostile.encode()})
    expect(page.locator('#count-imported')).to_have_text('1')

    # Remove the original; its saved evidence must survive. Undo must restore it.
    page.get_by_role('button', name='Read My source', exact=True).click()
    page.locator('#delete-source').click()
    page.locator('#nav-brief').click()
    expect(page.locator('.pin-missing')).to_have_count(1)
    expect(page.locator('.pin-card')).to_have_count(2)
    page.get_by_role('button', name='Undo', exact=True).click()
    expect(page.locator('.pin-missing')).to_have_count(0)

    # Backup, restore into a clean browser, and import again without duplicating anything.
    page.locator('#about-button').click()
    with page.expect_download() as downloaded:
        page.locator('#export-workspace').click()
    backup = Path(downloaded.value.path()).read_bytes()
    clean = browser.new_context(viewport={'width': 1200, 'height': 900})
    restored = clean.new_page(); restored.goto('http://127.0.0.1:3000/')
    restored.locator('#file-input').set_input_files({'name': 'commonplace-workspace.json', 'mimeType': 'application/json', 'buffer': backup})
    expect(restored.locator('#library-count')).to_have_text('10')
    expect(restored.locator('#brief-count')).to_have_text('2')
    restored.locator('#file-input').set_input_files({'name': 'commonplace-workspace.json', 'mimeType': 'application/json', 'buffer': backup})
    expect(restored.locator('#library-count')).to_have_text('10')
    expect(restored.locator('#brief-count')).to_have_text('2')
    restored.locator('#nav-brief').click()
    expect(restored.locator('#brief-title')).to_have_value('Spaces that let us stay')
    restored.locator('[data-move="down"]').first.click()
    expect(restored.locator('.pin-card').first.locator('blockquote')).to_have_text('A needle in a private document.')
    clean.close()

    # Mobile: no horizontal overflow, working document and save controls.
    mobile = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
    phone = mobile.new_page(); phone.goto('http://127.0.0.1:3000/')
    assert phone.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    phone.locator('#mobile-collection').select_option('design')
    expect(phone.locator('.source-card')).to_have_count(3)
    phone.locator('#mobile-collection').select_option('all')
    phone.screenshot(path=str(ARTIFACTS / 'commonplace-mobile.png'), full_page=True)
    phone.get_by_role('button', name='Read The city after dark', exact=True).click()
    phone.locator('.source-paragraph').first.get_by_role('button').click()
    phone.locator('#reader-to-brief').click()
    expect(phone.locator('.pin-card')).to_have_count(1)
    assert phone.evaluate('document.documentElement.scrollWidth <= window.innerWidth')

    # Storage failure: retain edits in memory, warn clearly, and still allow export.
    failure = browser.new_context()
    failure.add_init_script("Storage.prototype.setItem = function() { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };")
    broken = failure.new_page(); broken.goto('http://127.0.0.1:3000/')
    broken.get_by_role('button', name='Read The city after dark', exact=True).click()
    broken.locator('.source-paragraph').first.get_by_role('button').click()
    expect(broken.locator('#toast')).to_contain_text('Session only')
    expect(broken.locator('#storage-status')).to_have_text('Not saved — export a backup')
    broken.locator('#reader-to-brief').click()
    expect(broken.locator('.pin-card')).to_have_count(1)
    with broken.expect_download() as exported:
        broken.locator('#export-brief').click()
    assert 'Commonplace' in Path(exported.value.path()).read_text()
    failure.close()

    # Invalid stored state must not be silently overwritten.
    corrupt = browser.new_context()
    corrupt.add_init_script("localStorage.setItem('driver.commonplace.v1', '{not valid json');")
    bad = corrupt.new_page(); bad.goto('http://127.0.0.1:3000/')
    expect(bad.locator('.source-card')).to_have_count(9)
    bad.get_by_role('button', name='Read The city after dark', exact=True).click()
    bad.locator('.source-paragraph').first.get_by_role('button').click()
    assert bad.evaluate("localStorage.getItem('driver.commonplace.v1')") == '{not valid json'
    corrupt.close()

    # Render the exact portable artifact without its sibling files. This cloud
    # browser forbids file:// navigation, so fulfill the document at a local URL.
    portable = browser.new_context()
    local = portable.new_page()
    local_errors, local_requests = [], []
    local.on('pageerror', lambda error: local_errors.append(str(error)))
    portable_url = 'http://127.0.0.1:3000/portable.html'
    local.on('request', lambda req: local_requests.append(req.url) if req.url.startswith(('http:', 'https:')) and req.url != portable_url else None)
    local.route(portable_url, lambda route: route.fulfill(status=200, content_type='text/html', body=(ARTIFACTS / 'Commonplace.html').read_text()))
    local.goto(portable_url)
    portable.set_offline(True)
    expect(local.locator('.source-card')).to_have_count(9)
    local.locator('#search').fill('"public space"')
    assert 0 < local.locator('.source-card').count() < 9
    local.locator('.card-open').first.click()
    local.locator('.source-paragraph').first.get_by_role('button').click()
    local.locator('#reader-to-brief').click()
    expect(local.locator('.pin-card')).to_have_count(1)
    assert not local_errors, local_errors
    assert not local_requests, local_requests
    portable.close()
    assert not errors, errors
    assert not outside, outside
    browser.close()
    print('PASS: reader, exact citations, duplicate prevention, notes, persistence, Markdown export, search, collections, layouts, safe imports, removal/undo, backup/restore, reorder, and mobile.')
    print('PASS: zero JavaScript errors and zero external network requests.')
    print('PASS: blocked storage, corrupt storage preservation, mobile collection filter, and portable HTML edition.')
