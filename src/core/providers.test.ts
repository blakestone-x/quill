import { describe, it, expect } from 'vitest';
import { providers } from './providers';
import type { Transcriber, TranscriberConfig } from './providers';

describe('provider registry', () => {
  it('returns a registered transcriber for a known engine', () => {
    const fake: Transcriber = {
      config: { location: 'local', engine: 'test-engine' },
      async start() {},
      pushAudio() {},
      async stop() {}
    };
    providers.registerTranscriber('test-engine', () => fake);
    const cfg: TranscriberConfig = { location: 'local', engine: 'test-engine' };
    expect(providers.transcriber(cfg)).toBe(fake);
  });

  it('throws for an unregistered engine', () => {
    expect(() => providers.transcriber({ location: 'cloud', engine: 'nope' })).toThrow();
  });
});
