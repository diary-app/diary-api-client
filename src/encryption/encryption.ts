import NodeRSA = require('node-rsa');

const publicKeyFormat: NodeRSA.FormatPem = 'pkcs8-public-pem';
const privateKeyFormat: NodeRSA.FormatPem = 'pkcs8-private-pem';

import { pbkdf2Sync } from 'node:crypto';
import * as crypto from 'crypto';
import * as aes from 'aes-js';

const iterations = 1;
const keyLen = 32;


export interface RsaKeyPair {
  publicKeyB64: string;
  privateKeyB64: string;
}

export default class Encryption {
  static base64ToBytes(base64: string) : Buffer {
    return Buffer.from(base64, 'base64');
  }
  static utf8ToBytes(utf8str: string) : Buffer {
    return Buffer.from(utf8str, 'utf8');
  }
  static bytesToBase64(bytes: Uint8Array) : string {
    return Buffer.from(bytes).toString('base64');
  }
  static bytesToTextUtf8(bytes: Uint8Array): string {
    return new TextDecoder('utf-8').decode(bytes);
  }

  static generateSalt(): Uint8Array {
    return crypto.randomBytes(16);
  }

  static generateKey(): Uint8Array {
    return crypto.randomBytes(32);
  }

  static getMasterKey(password: string, saltBytes: Uint8Array): Uint8Array {
    return pbkdf2Sync(password, saltBytes, iterations, keyLen, 'sha512');
  }

  static generateRsaKeyPair(): RsaKeyPair {
    const nodeRsa = new NodeRSA({b: 512});
    nodeRsa.generateKeyPair();
    const publicKey = nodeRsa.exportKey(publicKeyFormat);
    const privateKey = nodeRsa.exportKey(privateKeyFormat);
    return { publicKeyB64: publicKey, privateKeyB64: privateKey };
  }

  static encryptAes(key: Uint8Array, data: Uint8Array): Uint8Array {
    const aesCtr = new aes.ModeOfOperation.ctr(key);
    return aesCtr.encrypt(data);
  }

  static decryptAes(key: Uint8Array, encrypted: Uint8Array): Uint8Array {
    const aesCtr = new aes.ModeOfOperation.ctr(key);
    return aesCtr.decrypt(encrypted);
  }

  static encryptRsa(publicKey: string, data: Uint8Array): Uint8Array {
    const nodeRsa = new NodeRSA({b: 512});
    nodeRsa.importKey(publicKey, publicKeyFormat);
    return nodeRsa.encrypt(data);
  }

  static decryptRsa(privateKey: string, encrypted: Buffer): Uint8Array {
    const nodeRsa = new NodeRSA({b: 512});
    nodeRsa.importKey(privateKey, privateKeyFormat);
    return nodeRsa.decrypt(encrypted);
  }
}