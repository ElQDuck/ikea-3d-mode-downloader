import { normalizeUrl } from '../src/utils/browser-utils'

describe('normalizeUrl', () => {
  it('resolves absolute urls unchanged', () => {
    const base = 'https://www.ikea.com/de/de/p/example/'
    const candidate = 'https://cdn.ikea.com/models/model.glb'
    expect(normalizeUrl(candidate, base)).toBe(candidate)
  })

  it('resolves protocol-relative urls', () => {
    const base = 'https://www.ikea.com/de/de/p/example/'
    const candidate = '//cdn.ikea.com/models/model.glb'
    expect(normalizeUrl(candidate, base)).toBe('https://cdn.ikea.com/models/model.glb')
  })

  it('resolves relative paths', () => {
    const base = 'https://www.ikea.com/de/de/p/example/page.html'
    const candidate = '../media/model.glb'
    expect(normalizeUrl(candidate, base)).toBe('https://www.ikea.com/de/de/media/model.glb')
  })
})
