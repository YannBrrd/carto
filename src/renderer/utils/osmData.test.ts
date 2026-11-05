import { describe, it, expect, vi } from 'vitest';
import { buildOverpassQuery, fetchFromOverpass } from './osmData';

describe('buildOverpassQuery', () => {
  const query = buildOverpassQuery({ south: 48.85, west: 2.35, north: 48.86, east: 2.36 });
  const bbox = '(48.85,2.35,48.86,2.36)';

  it('fetches the ways the map draws', () => {
    for (const key of ['highway', 'building', 'natural', 'waterway', 'landuse', 'leisure', 'railway']) {
      expect(query).toContain(`way["${key}"]${bbox};`);
    }
  });

  it('fetches the multipolygons of buildings and of the areas the map draws, with their member ways', () => {
    expect(query).toContain(`relation["type"="multipolygon"]["building"]${bbox};`);
    expect(query).toContain(`relation["type"="multipolygon"]["natural"~"^(water|wood|grassland|grass|beach)$"]${bbox};`);
    expect(query).toContain(`relation["type"="multipolygon"]["leisure"~"^(park|garden|playground|pitch)$"]${bbox};`);
    expect(query).toContain(`relation["type"="multipolygon"]["waterway"~"^(riverbank|dock)$"]${bbox};`);
    expect(query).toMatch(/relation\["type"="multipolygon"\]\["landuse"~"\^\(forest\|[a-z_|]+\)\$"\]/);
    expect(query).toMatch(/out body;\s*>;\s*out skel qt;/);
  });

  it('fetches POI nodes and house numbers', () => {
    expect(query).toContain(`node["amenity"]${bbox};`);
    expect(query).toContain(`node["addr:housenumber"]${bbox};`);
  });
});

describe('fetchFromOverpass', () => {
  const servers = ['https://a.example/api/interpreter', 'https://b.example/api/interpreter', 'https://c.example/api/interpreter'];
  const data = { elements: [{ type: 'node', id: 1 }] };

  type Answer = number | 'network' | 'invalid-json' | 'timeout' | object;
  const timedOutRemark = { remark: 'runtime error: Query timed out in "query" at line 3 after 30 seconds.', elements: [] };

  // Fake fetch answering each server in turn: an HTTP status, a network failure, or JSON data
  function fakeFetch(answers: Answer[]) {
    const urls: string[] = [];
    const fetchFn = async (url: string) => {
      urls.push(url);
      const answer = answers[urls.length - 1];
      if (answer === 'network') throw new TypeError('Failed to fetch');
      if (answer === 'timeout') throw new DOMException('The operation was aborted', 'AbortError');
      if (answer === 'invalid-json') {
        return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } } as unknown as Response;
      }
      if (typeof answer === 'number') {
        return { ok: false, status: answer, text: async () => 'refused', json: async () => ({}) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => answer } as unknown as Response;
    };
    return { fetchFn, urls };
  }

  const fetchWith = (answers: Answer[]) => {
    const fake = fakeFetch(answers);
    const result = fetchFromOverpass('[out:json];node(1);out;', { servers, fetchFn: fake.fetchFn, retryDelayMs: 0 });
    return { result, urls: fake.urls };
  };

  it('returns the data of the first server and sends the query as the data parameter', async () => {
    const { result, urls } = fetchWith([data]);
    await expect(result).resolves.toEqual(data);
    expect(urls).toEqual([`${servers[0]}?data=${encodeURIComponent('[out:json];node(1);out;')}`]);
  });

  it('tries the next server when a server refuses the request (406)', async () => {
    const { result, urls } = fetchWith([406, data]);
    await expect(result).resolves.toEqual(data);
    expect(urls).toHaveLength(2);
  });

  it('tries the next server when a server cannot be reached', async () => {
    const { result } = fetchWith(['network', 'network', data]);
    await expect(result).resolves.toEqual(data);
  });

  it('tries the next server when a server answers something that is not JSON', async () => {
    const { result } = fetchWith(['invalid-json', data]);
    await expect(result).resolves.toEqual(data);
  });

  it('asks to wait when every server limits the request rate', async () => {
    await expect(fetchWith([429, 429, 429]).result).rejects.toThrow('Trop de requêtes. Attendez quelques secondes et réessayez.');
  });

  it('reports overloaded servers when the last answer is a server error', async () => {
    await expect(fetchWith([406, 429, 504]).result).rejects.toThrow('Serveurs Overpass surchargés. Réessayez dans quelques instants.');
  });

  it('reports the refusal of a server rather than the connection when the other servers are unreachable', async () => {
    await expect(fetchWith([406, 'network', 'network']).result).rejects.toThrow('Erreur API (406)');
  });

  it('asks to check the connection when no server can be reached', async () => {
    await expect(fetchWith(['network', 'network', 'network']).result)
      .rejects.toThrow('Impossible de récupérer les données OSM. Vérifiez votre connexion.');
  });

  it('tries the next server when a request times out', async () => {
    const { result, urls } = fetchWith(['timeout', data]);
    await expect(result).resolves.toEqual(data);
    expect(urls).toHaveLength(2);
  });

  it('asks to zoom in when every request times out, whatever the other answers', async () => {
    await expect(fetchWith(['timeout', 406, 'network']).result).rejects.toThrow('Zone trop grande, zoomez davantage.');
  });

  it('tries the next server when a server answers a timeout remark instead of data', async () => {
    const { result, urls } = fetchWith([timedOutRemark, data]);
    await expect(result).resolves.toEqual(data);
    expect(urls).toHaveLength(2);
  });

  it('asks to zoom in when every server answers a timeout remark', async () => {
    await expect(fetchWith([timedOutRemark, timedOutRemark, timedOutRemark]).result).rejects.toThrow('Zone trop grande, zoomez davantage.');
  });

  it('reports another runtime error of the server', async () => {
    const failed = { remark: 'runtime error: something else', elements: [] };
    await expect(fetchWith([failed, 'network', 'network']).result).rejects.toThrow('runtime error: something else');
  });

  it('aborts a request that lasts longer than the timeout and moves on', async () => {
    vi.useFakeTimers();
    try {
      const signals: AbortSignal[] = [];
      const fetchFn = (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        const signal = init!.signal!;
        signals.push(signal);
        signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted', 'AbortError')));
      });
      const result = fetchFromOverpass('[out:json];node(1);out;', { servers, fetchFn, retryDelayMs: 0, timeoutMs: 1000 });
      result.catch(() => {});  // Checked once the timers have run
      await vi.advanceTimersByTimeAsync(999);
      expect(signals).toHaveLength(1);
      expect(signals[0].aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(3000);
      expect(signals).toHaveLength(3);
      expect(signals.every(signal => signal.aborted)).toBe(true);
      await expect(result).rejects.toThrow('Zone trop grande, zoomez davantage.');
    } finally {
      vi.useRealTimers();
    }
  });
});
