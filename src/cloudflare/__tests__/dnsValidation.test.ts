import { validateDnsRecord } from '../dnsValidation';

const draft = (patch: Partial<Parameters<typeof validateDnsRecord>[0]>) => ({
  type: 'A',
  name: 'www',
  content: '203.0.113.10',
  priority: '10',
  ...patch,
});

describe('name validation', () => {
  test('accepts hosts, wildcards and the root shorthand', () => {
    expect(validateDnsRecord(draft({ name: 'www' }))).toEqual({});
    expect(validateDnsRecord(draft({ name: '@' }))).toEqual({});
    expect(validateDnsRecord(draft({ name: '*.staging' }))).toEqual({});
    expect(validateDnsRecord(draft({ name: '_dmarc.example.com' }))).toEqual(
      {},
    );
  });

  test('rejects empty and malformed names', () => {
    expect(validateDnsRecord(draft({ name: '  ' }))).toEqual({
      name: 'dns.errNameRequired',
    });
    expect(validateDnsRecord(draft({ name: 'bad name' }))).toEqual({
      name: 'dns.errNameInvalid',
    });
    expect(validateDnsRecord(draft({ name: 'foo..bar' }))).toEqual({
      name: 'dns.errNameInvalid',
    });
  });
});

describe('A records', () => {
  test('accepts valid IPv4', () => {
    expect(validateDnsRecord(draft({ content: '1.2.3.4' }))).toEqual({});
    expect(validateDnsRecord(draft({ content: '255.255.255.255' }))).toEqual(
      {},
    );
  });

  test('rejects non-IPv4 content', () => {
    expect(validateDnsRecord(draft({ content: '256.1.1.1' }))).toEqual({
      content: 'dns.errIpv4',
    });
    expect(validateDnsRecord(draft({ content: 'example.com' }))).toEqual({
      content: 'dns.errIpv4',
    });
    expect(validateDnsRecord(draft({ content: '2001:db8::1' }))).toEqual({
      content: 'dns.errIpv4',
    });
  });
});

describe('AAAA records', () => {
  test('accepts full and compressed IPv6', () => {
    expect(
      validateDnsRecord(
        draft({
          type: 'AAAA',
          content: '2606:4700:4700:0000:0000:0000:0000:1111',
        }),
      ),
    ).toEqual({});
    expect(
      validateDnsRecord(draft({ type: 'AAAA', content: '2001:db8::1' })),
    ).toEqual({});
    expect(validateDnsRecord(draft({ type: 'AAAA', content: '::1' }))).toEqual(
      {},
    );
  });

  test('rejects IPv4 and malformed addresses', () => {
    expect(
      validateDnsRecord(draft({ type: 'AAAA', content: '114.34.87.116' })),
    ).toEqual({ content: 'dns.errIpv6' });
    expect(
      validateDnsRecord(draft({ type: 'AAAA', content: '2001:db8:::1' })),
    ).toEqual({ content: 'dns.errIpv6' });
  });
});

describe('hostname content records', () => {
  test('CNAME and NS accept hostnames but not IPs', () => {
    expect(
      validateDnsRecord(draft({ type: 'CNAME', content: 'acme.dev' })),
    ).toEqual({});
    expect(
      validateDnsRecord(draft({ type: 'NS', content: 'ns1.example.com.' })),
    ).toEqual({});
    expect(
      validateDnsRecord(draft({ type: 'CNAME', content: '1.2.3.4' })),
    ).toEqual({ content: 'dns.errHostname' });
  });

  test('MX validates hostname and priority range', () => {
    expect(
      validateDnsRecord(
        draft({ type: 'MX', content: 'mail.example.com', priority: '10' }),
      ),
    ).toEqual({});
    expect(
      validateDnsRecord(
        draft({ type: 'MX', content: 'mail.example.com', priority: '-1' }),
      ),
    ).toEqual({ priority: 'dns.errPriority' });
    expect(
      validateDnsRecord(
        draft({ type: 'MX', content: 'mail.example.com', priority: 'abc' }),
      ),
    ).toEqual({ priority: 'dns.errPriority' });
    expect(
      validateDnsRecord(
        draft({ type: 'MX', content: 'mail.example.com', priority: '70000' }),
      ),
    ).toEqual({ priority: 'dns.errPriority' });
  });
});

describe('TXT records', () => {
  test('accepts any non-empty content', () => {
    expect(
      validateDnsRecord(
        draft({ type: 'TXT', content: 'v=spf1 include:_spf.google.com ~all' }),
      ),
    ).toEqual({});
    expect(validateDnsRecord(draft({ type: 'TXT', content: ' ' }))).toEqual({
      content: 'dns.errContentRequired',
    });
  });
});
