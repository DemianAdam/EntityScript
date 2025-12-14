function hash(str) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str);
  return Utilities.base64Encode(digest);
}

function isHashed(value) {
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  return typeof value === 'string' && base64Regex.test(value) && value.length % 4 === 0;
}

function validateAccessToken(token, privateKey, context) {
  if (!token) {
    throw new Error("No token provided");
  }

  let user = context.Users.all().find(u => u.token === token);
  if (!user) {
    throw new Error("Invalid token");
  }
  user = context.Users.findById(user.id, 1);
  if (!user) {
    throw new Error("User not found");
  }
  const data = parseJwt(token, privateKey);
  if (data.id !== user.id) {
    throw new Error("Invalid token");
  }


  return user;
}

function parseJwt(jsonWebToken, privateKey) {

  if (!privateKey) {
    throw new Error('Private key not found');
  }

  const [header, payload, signature] = jsonWebToken.split('.');
  const signatureBytes = Utilities.computeHmacSha256Signature(`${header}.${payload}`, privateKey);
  const validSignature = Utilities.base64EncodeWebSafe(signatureBytes);
  if (signature !== validSignature.replace(/=+$/, '')) {
    throw new Error('Invalid signature');
  }

  const blob = Utilities.newBlob(Utilities.base64Decode(payload)).getDataAsString();

  const { exp, ...data } = JSON.parse(blob);

  if (new Date(exp * 1000) < new Date()) {
    throw new Error('The token has expired');
  }

  return data;
};