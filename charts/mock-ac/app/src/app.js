const express = require('express');
const morgan = require('morgan');
const crypto = require('crypto');

const app = express();

// RSA Private key for signing tokens (local development only)
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCtXRY+GO6mJHUR
z5NdzfIyCUSuG8NvgiHhPAdUbIy4wR5vcuyRBMxIkP/5lky9jKnAIYigC3nSt934
1AH2Lrq8pA9nszvCsYp7dc26wvT/LlPEwJ4ZT8Ocp2hAuZC85Kqmvu/B0KNjLsRC
gAPovg2c73npb+0GXC1ZAIoWdIxUlz+JWbty3YjdnBDJAqSwgelHc3mYg1KH2FAk
D6otIvDwqWDd2TzMKtB2bY2RO/VmNsUoy/nJHVJetirUM5E4pFikWvvDW8gyF5IM
Fm0amqLw/y3lWAi5EbffsXftHK8Ahbqdl4y47mnL1kGl/ZQgH9Vw0WPRCDCLPGuT
+kBvGl+dAgMBAAECggEAP+tP7aJcr2ZGwcPihlYOI/O13mn/I2h8HGL5IuAI/H+7
vITHg2qc9W586qXHcqXf2qaijLvedVp0na9xb7boA/CLe4UilhTGxeF38pG6KjIH
EcahJBz8NxCkSCUDIBpBb0x78t59t26BTzGK/2+/bir/rJmnb05iK+wefcwIB5HH
JNF5z0PqVmii7wkJ/wXBB+OyiBx/G1takKpmZNzHhbDLDR2gFWLngjmEGkVos9FY
X6wslmWHP/YNpfaTSmDlttws2SA5jTaFjJYSFuzCweXHza8Tcy9C6ieI4zyNqD07
of2MdecAdZ+rQRDO4Y1gJJ5rH/fy9D0268ZAeTVTQwKBgQDYQroYNRzfsQ2sLkOq
oSsAYwqmqXkB1mxjVZMj6McHL78Q4KbC3FWLlgh1isIvdCMIuaLQmHH/h+Rn2/gL
+XTGwKrOF9YKyn+HftciW6YvWydISM1E46VnFY1QwrTw+CzAaa7wZ9iYPCxwZe5E
1DpDClqB3HOG5gENqUEoBNldOwKBgQDNOGjpE9qyGg2fuEy0S2b92haINnvkIgJ5
PIK2BjMGXp8dkMbNaSU7ag841rR6Qu8KPsqHNHNC46Vmu9zbJGPuots7ceinSLXP
GCUh31aqcn03buGNuuszD/b6Rh79tocIcHxrkROMK9XcJ595kI6UFFyZtRu7kGQI
OTSHd4lJBwKBgGl1iLh7VhxDhA5d9UOFGqoyoiQJ6ueZf/uk5H8TadM4Vm1NkCTg
O5s5S+C+DNoFQXxkwmAEpzrcMubu3vQ/7tFpbSHZf9h9TVlu4kxv8weO5QYb8nXQ
qX0uhl5GxOPpsjEWmGfFzFrYpTcejeXktJCywNYpAfFbwlG+Ivb3/mO3AoGBAJnZ
rGzwQYg8F/KhzH9t9+xfz3yWvBKvnIMfZi7oPuCLl2Ym36OnLA562KaX7/2oqGRZ
5qOuIqsG1z1Joa14fqKs3QaXwv+Gdyamx0+5i9OEuXMRYW9LroA9e77tStaSPHGL
Qvuxa6IuSsodumT8hqdlDHb/W6cl/Jhdqo/UgcuJAoGAXoIQljUrwj2DsPGa5RaN
C1J2y2bFmEvSLyBlNVAHsmu9xSucK0SF+dO01JA7SYxnpKi0nrN04SzyDNMKu/dJ
IFCNxp2B5LXCu2jczHOCllItvUvBQX6lXxf1SlY6Fj5qY1HKBdm35eB+njfoSaWZ
TfA3tFMY1d98xBdQ/z71t0A=
-----END PRIVATE KEY-----`;

// Function to sign token data
function signTokenData(data) {
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  return sign.sign(PRIVATE_KEY, 'base64');
}
const PORT = process.env.PORT || 8080;

// Middleware
app.use(morgan('combined'));
app.use(express.text({ type: ['application/xml', 'text/xml'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration from environment
const config = {
  resourceID: process.env.RESOURCE_ID || 'ivo://cadc.nrc.ca/gms',
  baseURL: process.env.BASE_URL || 'http://localhost:8080/ac'
};

// Default users — overrideable via MOCK_AC_USERS env var (JSON)
const DEFAULT_USERS = {
  'admin': {
    userID: 'admin',
    identityType: 'HTTP',
    firstName: 'Platform',
    lastName: 'Admin',
    email: 'admin@haproxy.cadc.dao.nrc.ca',
    x500: 'CN=admin_mock,OU=CADC,O=HIA,C=CA',
    posixDetails: { uid: 10000, gid: 10000, homeDirectory: '/home/10000' }
  },
  'doiadmin': {
    userID: 'doiadmin',
    identityType: 'X509',
    firstName: 'DOI',
    lastName: 'Administrator',
    email: 'doiadmin@cadc.nrc.ca',
    x500: 'CN=doiadmin_mock,OU=CADC,O=HIA,C=CA',
    posixDetails: { uid: 10001, gid: 10001, homeDirectory: '/home/10001' }
  },
  'testuser': {
    userID: 'testuser',
    identityType: 'HTTP',
    firstName: 'Test',
    lastName: 'User',
    email: 'testuser@cadc.nrc.ca',
    x500: 'CN=testuser_mock,OU=CADC,O=HIA,C=CA',
    posixDetails: { uid: 10002, gid: 10002, homeDirectory: '/home/10002' }
  }
};

// Default groups — overrideable via MOCK_AC_GROUPS env var (JSON)
const DEFAULT_GROUPS = {
  'skaha-users': {
    groupID: 'skaha-users',
    ownerID: 'admin',
    description: 'Skaha Science Platform Users',
    userMembers: ['admin', 'doiadmin', 'testuser'],
    groupMembers: []
  },
  'skaha-admins': {
    groupID: 'skaha-admins',
    ownerID: 'admin',
    description: 'Skaha Science Platform Administrators',
    userMembers: ['admin', 'doiadmin'],
    groupMembers: []
  },
  'skaha-headless': {
    groupID: 'skaha-headless',
    ownerID: 'admin',
    description: 'Skaha Headless Session Users',
    userMembers: ['admin'],
    groupMembers: []
  },
  'platform-users': {
    groupID: 'platform-users',
    ownerID: 'admin',
    description: 'Science Platform Users',
    userMembers: ['admin', 'doiadmin', 'testuser'],
    groupMembers: []
  }
};

// Load from env vars if provided, otherwise use defaults
let users = DEFAULT_USERS;
let groups = DEFAULT_GROUPS;
try {
  if (process.env.MOCK_AC_USERS) users = JSON.parse(process.env.MOCK_AC_USERS);
} catch (e) { console.error('Failed to parse MOCK_AC_USERS env var:', e.message); }
try {
  if (process.env.MOCK_AC_GROUPS) groups = JSON.parse(process.env.MOCK_AC_GROUPS);
} catch (e) { console.error('Failed to parse MOCK_AC_GROUPS env var:', e.message); }

// Build a reverse lookup: email → userID
const emailToUser = {};
for (const [uid, u] of Object.entries(users)) {
  if (u.email) emailToUser[u.email.toLowerCase()] = uid;
}

// Resolve a JWT payload to a known mock-ac username.
// Dex's local connector encodes sub as protobuf (opaque) and may not
// include preferred_username at all.  Priority order:
//   1. preferred_username  (standard OIDC claim)
//   2. email               (match against users DB)
//   3. name                (only if it looks like a plain username, not base64)
//   4. sub                 (last resort – may be an opaque Dex protobuf string)
function resolveUsernameFromJwt(payload) {
  // 1. preferred_username
  if (payload.preferred_username && users[payload.preferred_username]) {
    return payload.preferred_username;
  }

  // 2. email → reverse-lookup
  if (payload.email) {
    const byEmail = emailToUser[payload.email.toLowerCase()];
    if (byEmail) return byEmail;
  }

  // 3. name — only if it's a short alphanumeric string (not base64 blob)
  if (payload.name && /^[a-zA-Z][a-zA-Z0-9_.-]{0,30}$/.test(payload.name) && users[payload.name]) {
    return payload.name;
  }

  // 4. preferred_username even if not in users DB (external user)
  if (payload.preferred_username) return payload.preferred_username;

  // 5. email prefix as username
  if (payload.email) {
    const prefix = payload.email.split('@')[0].toLowerCase();
    if (users[prefix]) return prefix;
    return prefix; // return even if unknown — let caller decide
  }

  // 6. sub (opaque, but nothing better)
  if (payload.sub) return payload.sub;

  return null;
}

// Helper to extract user from certificate DN header or Bearer token
function extractUserFromRequest(req) {
  // First check for Bearer token
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Try OIDC JWT (three dot-separated parts)
    const jwtParts = token.split('.');
    if (jwtParts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf-8'));
        const username = resolveUsernameFromJwt(payload);
        if (username) {
          console.log(`[mock-ac] JWT resolved to username: ${username} (from claims: preferred_username=${payload.preferred_username}, email=${payload.email}, name=${payload.name ? payload.name.substring(0, 20) + '...' : undefined})`);
          return username;
        }
      } catch (e) {
        console.log('Failed to decode JWT payload:', e.message);
      }
    }

    // Fall back to CADC SSO token (base64 encoded, contains userID=<username>)
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const userIdMatch = decoded.match(/userID=([^&]+)/);
      if (userIdMatch) {
        return userIdMatch[1];
      }
    } catch (e) {
      console.log('Failed to decode Bearer token:', e.message);
    }
  }

  // Check for certificate header
  const certHeader = req.headers['x-client-certificate'] || req.headers['ssl-client-cert'];
  if (certHeader) {
    // Extract CN from certificate DN
    const match = certHeader.match(/CN=([^,\/]+)/i);
    if (match) {
      return match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
    }
  }

  // Check for cookie
  const cookies = req.headers.cookie;
  if (cookies) {
    const ssoMatch = cookies.match(/CADC_SSO=([^;]+)/);
    if (ssoMatch) {
      try {
        const decoded = Buffer.from(ssoMatch[1], 'base64').toString('utf-8');
        const userIdMatch = decoded.match(/userID=([^&]+)/);
        if (userIdMatch) {
          return userIdMatch[1];
        }
      } catch (e) {
        console.log('Failed to decode cookie token:', e.message);
      }
    }
  }

  return 'doiadmin'; // Default user for testing
}

// Alias for backward compatibility
function extractUserFromCert(req) {
  return extractUserFromRequest(req);
}

// ============== VOSI Endpoints ==============

// GET /ac/availability
app.get('/ac/availability', (req, res) => {
  const detail = req.query.detail;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<vosi:availability xmlns:vosi="http://www.ivoa.net/xml/VOSIAvailability/v1.0">
  <vosi:available>true</vosi:available>
  <vosi:note>mock-ac service is running</vosi:note>
</vosi:availability>`;
  res.type('application/xml').send(xml);
});

// GET /ac/capabilities
app.get('/ac/capabilities', (req, res) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<vosi:capabilities xmlns:vosi="http://www.ivoa.net/xml/VOSICapabilities/v1.0"
                   xmlns:vr="http://www.ivoa.net/xml/VOResource/v1.0"
                   xmlns:vs="http://www.ivoa.net/xml/VODataService/v1.1"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <capability standardID="ivo://ivoa.net/std/VOSI#capabilities">
    <interface xsi:type="vs:ParamHTTP" role="std">
      <accessURL use="full">${config.baseURL}/capabilities</accessURL>
    </interface>
  </capability>
  <capability standardID="ivo://ivoa.net/std/VOSI#availability">
    <interface xsi:type="vs:ParamHTTP" role="std">
      <accessURL use="full">${config.baseURL}/availability</accessURL>
    </interface>
  </capability>
  <capability standardID="ivo://ivoa.net/std/UMS#users-0.1">
    <interface xsi:type="vs:ParamHTTP" role="std" version="0.1">
      <accessURL use="base">${config.baseURL}/users</accessURL>
      <securityMethod standardID="ivo://ivoa.net/sso#cookie" />
      <securityMethod standardID="ivo://ivoa.net/sso#tls-with-certificate" />
      <securityMethod standardID="ivo://ivoa.net/sso#token" />
    </interface>
  </capability>
  <capability standardID="ivo://ivoa.net/std/UMS#whoami-0.1">
    <interface xsi:type="vs:ParamHTTP" role="std" version="0.1">
      <accessURL use="base">${config.baseURL}/whoami</accessURL>
      <securityMethod standardID="ivo://ivoa.net/sso#cookie" />
      <securityMethod standardID="ivo://ivoa.net/sso#tls-with-certificate" />
      <securityMethod standardID="ivo://ivoa.net/sso#token" />
    </interface>
  </capability>
  <capability standardID="ivo://ivoa.net/std/GMS#groups-0.1">
    <interface xsi:type="vs:ParamHTTP" role="std" version="0.1">
      <accessURL use="base">${config.baseURL}/groups</accessURL>
      <securityMethod standardID="ivo://ivoa.net/sso#cookie" />
      <securityMethod standardID="ivo://ivoa.net/sso#tls-with-certificate" />
      <securityMethod standardID="ivo://ivoa.net/sso#token" />
    </interface>
  </capability>
  <capability standardID="ivo://ivoa.net/std/GMS#search-0.1">
    <interface xsi:type="vs:ParamHTTP" role="std" version="0.1">
      <accessURL use="base">${config.baseURL}/search</accessURL>
      <securityMethod standardID="ivo://ivoa.net/sso#cookie" />
      <securityMethod standardID="ivo://ivoa.net/sso#tls-with-certificate" />
      <securityMethod standardID="ivo://ivoa.net/sso#token" />
    </interface>
  </capability>
  <capability standardID="ivo://ivoa.net/std/GMS#search-1.0">
    <interface xsi:type="vs:ParamHTTP" role="std" version="1.0">
      <accessURL use="base">${config.baseURL}/search</accessURL>
      <securityMethod standardID="ivo://ivoa.net/sso#cookie" />
      <securityMethod standardID="ivo://ivoa.net/sso#tls-with-certificate" />
      <securityMethod standardID="ivo://ivoa.net/sso#token" />
    </interface>
  </capability>
  <capability standardID="ivo://ivoa.net/sso#tls-with-password">
    <interface xsi:type="vs:ParamHTTP" role="std" version="0.1">
      <accessURL use="base">${config.baseURL}/login</accessURL>
    </interface>
  </capability>
  <capability standardID="ivo://ivoa.net/std/UMS#login-0.1">
    <interface xsi:type="vs:ParamHTTP" role="std" version="0.1">
      <accessURL use="base">${config.baseURL}/login</accessURL>
    </interface>
  </capability>
  <capability standardID="http://www.opencadc.org/std/posix#group-mapping-0.1">
    <interface xsi:type="vs:ParamHTTP" role="std" version="0.1">
      <accessURL use="base">${config.baseURL}/gidmap</accessURL>
      <securityMethod standardID="ivo://ivoa.net/sso#cookie" />
      <securityMethod standardID="ivo://ivoa.net/sso#tls-with-certificate" />
      <securityMethod standardID="ivo://ivoa.net/sso#token" />
    </interface>
  </capability>
  <capability standardID="http://www.opencadc.org/std/posix#user-mapping-0.1">
    <interface xsi:type="vs:ParamHTTP" role="std" version="0.1">
      <accessURL use="base">${config.baseURL}/uidmap</accessURL>
      <securityMethod standardID="ivo://ivoa.net/sso#cookie" />
      <securityMethod standardID="ivo://ivoa.net/sso#tls-with-certificate" />
      <securityMethod standardID="ivo://ivoa.net/sso#token" />
    </interface>
  </capability>
</vosi:capabilities>`;
  res.type('application/xml').send(xml);
});

// ============== User Management ==============

// GET /ac/whoami - Returns authenticated user info
app.get('/ac/whoami', (req, res) => {
  const userID = extractUserFromRequest(req);
  const user = users[userID] || users['doiadmin'];
  const acceptHeader = req.headers['accept'] || '';

  // Return JSON if requested (in xml2js parsed format expected by rafts-open)
  if (acceptHeader.includes('application/json')) {
    return res.json({
      user: {
        personalDetails: {
          firstName: { $: user.firstName },
          lastName: { $: user.lastName },
          email: { $: user.email },
          institute: { $: 'NRC-CNRC' }
        },
        posixDetails: {
          username: { $: user.userID },
          uid: { $: user.posixDetails.uid },
          gid: { $: user.posixDetails.gid },
          homeDirectory: { $: user.posixDetails.homeDirectory }
        },
        identities: {
          $: []
        }
      }
    });
  }

  // Default: return XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<user xmlns="http://www.opencadc.org/ac">
  <userID type="${user.identityType}">${user.userID}</userID>
  <personalDetails>
    <firstName>${user.firstName}</firstName>
    <lastName>${user.lastName}</lastName>
    <email>${user.email}</email>
  </personalDetails>
</user>`;
  res.type('application/xml').send(xml);
});

// GET /ac/users - List all users
app.get('/ac/users', (req, res) => {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<users xmlns="http://www.opencadc.org/ac">`;

  for (const [id, user] of Object.entries(users)) {
    xml += `
  <user>
    <userID type="${user.identityType}">${user.userID}</userID>
  </user>`;
  }
  xml += `
</users>`;
  res.type('application/xml').send(xml);
});

// GET /ac/users/:userID - Get specific user
app.get('/ac/users/:userID', (req, res) => {
  const userID = req.params.userID;
  const idType = req.query.idType?.toLowerCase() || 'http';

  // Try to find existing user first
  let user = users[userID];

  // For X500 lookups, extract username from CN and create a mock user if not found
  if (!user && idType === 'x500') {
    // Extract CN from X500 DN (e.g., "CN=user_abc,OU=cadc,O=hia,C=ca")
    const cnMatch = userID.match(/CN=([^,]+)/i);
    const username = cnMatch ? cnMatch[1].toLowerCase().replace(/_[a-f0-9]+$/, '') : 'mockuser';

    // Check if we have this user
    user = users[username];

    // If still not found, create a dynamic mock user
    if (!user) {
      const uid = Math.floor(Math.random() * 1000000) + 100000;
      user = {
        userID: username,
        x500: userID,
        identityType: 'HTTP',
        firstName: username.charAt(0).toUpperCase() + username.slice(1),
        lastName: 'User',
        email: `${username}@cadc.nrc.ca`,
        posixDetails: { uid: uid, gid: uid, homeDirectory: `/home/${uid}` }
      };
    }
  }

  if (!user) {
    return res.status(404).type('text/plain').send(`User not found: ${userID}`);
  }

  // Generate a consistent internal ID
  const internalID = `00000000-0000-0000-0000-${user.posixDetails.uid.toString().padStart(12, '0')}`;
  const x500dn = user.x500 || `CN=${user.userID}_mock,OU=CADC,O=HIA,C=CA`;

  // Return user with identities in the format DOI expects (no namespace per real AC response)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<user>
  <internalID>
    <uri>${config.resourceID}?${internalID}</uri>
  </internalID>
  <identities>
    <identity type="HTTP">${user.userID}</identity>
    <identity type="CADC">${internalID}</identity>
    <identity type="POSIX">${user.posixDetails.uid}</identity>
    <identity type="X500">${x500dn}</identity>
  </identities>
  <personalDetails>
    <firstName>${user.firstName}</firstName>
    <lastName>${user.lastName}</lastName>
    <email>${user.email}</email>
  </personalDetails>
  <posixDetails>
    <username>${user.userID}</username>
    <uid>${user.posixDetails.uid}</uid>
    <gid>${user.posixDetails.gid}</gid>
    <homeDirectory>${user.posixDetails.homeDirectory}</homeDirectory>
  </posixDetails>
</user>`;
  res.type('application/xml').send(xml);
});

// ============== Group Management ==============

// GET /ac/groups - List all groups
app.get('/ac/groups', (req, res) => {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<groups xmlns="http://www.opencadc.org/ac">`;

  for (const [id, group] of Object.entries(groups)) {
    xml += `
  <group>
    <groupID>${config.resourceID}?${group.groupID}</groupID>
  </group>`;
  }
  xml += `
</groups>`;
  res.type('application/xml').send(xml);
});

// GET /ac/groups/:groupID - Get specific group
app.get('/ac/groups/:groupID', (req, res) => {
  const groupID = req.params.groupID;
  const group = groups[groupID];

  if (!group) {
    return res.status(404).type('text/plain').send(`Group not found: ${groupID}`);
  }

  let membersXml = '';
  for (const member of group.userMembers) {
    membersXml += `
    <userMember>
      <userID type="HTTP">${member}</userID>
    </userMember>`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<group xmlns="http://www.opencadc.org/ac">
  <groupID>${config.resourceID}?${group.groupID}</groupID>
  <ownerID type="HTTP">${group.ownerID}</ownerID>
  <description>${group.description}</description>
  <userMembers>${membersXml}
  </userMembers>
  <groupMembers/>
</group>`;
  res.type('application/xml').send(xml);
});

// PUT /ac/groups - Create group
app.put('/ac/groups', (req, res) => {
  // For mock, just return success
  res.status(200).send('OK');
});

// PUT /ac/groups/:groupID - Create specific group
app.put('/ac/groups/:groupID', (req, res) => {
  const groupID = req.params.groupID;
  if (!groups[groupID]) {
    groups[groupID] = {
      groupID: groupID,
      ownerID: extractUserFromCert(req),
      description: `Group ${groupID}`,
      userMembers: [],
      groupMembers: []
    };
  }
  res.status(200).send('OK');
});

// DELETE /ac/groups/:groupID
app.delete('/ac/groups/:groupID', (req, res) => {
  const groupID = req.params.groupID;
  delete groups[groupID];
  res.status(200).send('OK');
});

// PUT /ac/groups/:groupID/userMembers/:userID - Add user to group
app.put('/ac/groups/:groupID/userMembers/:userID', (req, res) => {
  const { groupID, userID } = req.params;
  if (groups[groupID] && !groups[groupID].userMembers.includes(userID)) {
    groups[groupID].userMembers.push(userID);
  }
  res.status(200).send('OK');
});

// DELETE /ac/groups/:groupID/userMembers/:userID - Remove user from group
app.delete('/ac/groups/:groupID/userMembers/:userID', (req, res) => {
  const { groupID, userID } = req.params;
  if (groups[groupID]) {
    groups[groupID].userMembers = groups[groupID].userMembers.filter(m => m !== userID);
  }
  res.status(200).send('OK');
});

// ============== Search ==============

// GET /ac/search - Search groups by role/membership
// IVOA GMS #search-1.0 returns plain-text group URIs, one per line.
// The OpenCADC Java GMS client (cadc-gms) parses each line as a GroupURI
// and rejects anything that isn't a valid URI (no XML, no angle brackets).
app.get('/ac/search', (req, res) => {
  const { role, id } = req.query;
  const userID = id || extractUserFromCert(req);

  let matchingGroups = [];
  for (const [groupId, group] of Object.entries(groups)) {
    if (group.userMembers.includes(userID)) {
      if (!role || role === 'member' || (role === 'owner' && group.ownerID === userID)) {
        matchingGroups.push(group);
      }
    }
  }

  // Return plain-text list: one group name per line.
  // The OpenCADC Java GMS client only allows alphanumeric, '/', '-', '.', '_', '~'
  // in group names — no full URIs (ivo:// contains ':' and '?').
  const lines = matchingGroups.map(g => g.groupID);
  res.type('text/plain').send(lines.join('\n') + '\n');
});

// ============== Login ==============

// POST /ac/login - Password login (returns SSO token)
app.post('/ac/login', (req, res) => {
  // Get credentials from query params or body
  const username = req.query.username || req.body?.username;
  const password = req.query.password || req.body?.password;

  // Mock login - accept any credentials
  if (username) {
    const user = users[username] || {
      userID: username,
      posixDetails: { uid: 10001 }
    };

    // Generate expiry time (48 hours from now)
    const expiryTime = Date.now() + (48 * 60 * 60 * 1000);

    // Build token payload (without signature first)
    const tokenDataWithoutSig = [
      `expirytime=${expiryTime}`,
      `X500=CN=${username}_mock,OU=CADC,O=HIA,C=CA`,
      `numericID=00000000-0000-0000-0000-000000000001`,
      `POSIX=${user.posixDetails?.uid || 10001}`,
      `userID=${username}`,
      `scope=sso:cadc+canfar`,
      `domain=cadc-ccda.hia-iha.nrc-cnrc.gc.ca`,
      `domain=canfar.net`,
      `domain=cadc.dao.nrc.ca`
    ].join('&');

    // Sign the token data and append signature
    const signature = signTokenData(tokenDataWithoutSig);
    const tokenData = `${tokenDataWithoutSig}&signature=${signature}`;

    // Base64 encode the token
    const token = Buffer.from(tokenData).toString('base64');

    // Set cookie and return token
    res.cookie('CADC_SSO', token, {
      httpOnly: true,
      maxAge: 48 * 60 * 60 * 1000, // 48 hours
      domain: '.cadc.dao.nrc.ca',
      path: '/'
    });

    res.type('text/plain').send(token);
  } else {
    res.status(401).send('Unauthorized: username required');
  }
});

// ============== POSIX Mapping ==============

// GET /ac/uidmap - Returns passwd-like format: username:x:uid:gid:::
app.get('/ac/uidmap', (req, res) => {
  let result = '';
  for (const [id, user] of Object.entries(users)) {
    result += `${user.userID}:x:${user.posixDetails.uid}:${user.posixDetails.gid}:::\n`;
  }
  res.type('text/plain').send(result);
});

// GET /ac/gidmap - Returns group-like format: groupname:x:gid:
app.get('/ac/gidmap', (req, res) => {
  let result = '';
  let gid = 20001;
  for (const [id, group] of Object.entries(groups)) {
    result += `${group.groupID}:x:${gid}:\n`;
    gid++;
  }
  res.type('text/plain').send(result);
});

// ============== Root endpoint ==============
app.get('/ac', (req, res) => {
  res.redirect('/ac/capabilities');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mock-ac' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Mock AC service running on port ${PORT}`);
  console.log(`Resource ID: ${config.resourceID}`);
  console.log(`Base URL: ${config.baseURL}`);
});
