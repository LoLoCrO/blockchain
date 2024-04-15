import 'dotenv/config'

import * as crypto from 'crypto';
import ecliptic from 'elliptic';

const EC = ecliptic.ec;
const ec = new EC('secp256k1');

const MINT_KEY_PAIR = ec.keyFromPrivate(process.env.MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

const keyPair = ec.keyFromPrivate(process.env.privateKey, "hex");
const publicKey = keyPair.getPublic("hex");

function SHA256(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

export class Block {
    constructor(timestamp, data = [], previousHash = '') {
        this.timestamp = timestamp;
        this.data = data;
        this.hash = Block.getHash(this);
        this.previousHash = previousHash;
        this.nonce = 0;
    }

    static getHash(block) {
        return SHA256(block.previousHash + block.timestamp + JSON.stringify(block.data) + block.nonce);
    }

    mine(difficulty) {
        while (!this.hash.startsWith(Array(difficulty + 1).join('0'))) {
            this.nonce++;
            this.hash = Block.getHash(this);
        }
    }

    static hasValidTransactions(block, chain) {
        let gas = 0;
        let reward = 0;

        block.data.forEach(transaction => {
            if (transaction.from !== MINT_PUBLIC_ADDRESS) {
                gas += transaction.gas;
            } else {
                reward = transaction.amount;
            }
        });

        return (
            reward - gas === chain.reward &&
            block.data.every(transaction => Transaction.isValid(transaction, chain)) &&
            block.data.filter(transaction => transaction.from === MINT_PUBLIC_ADDRESS).length === 1
        );
    }
}

export class Blockchain {
    constructor() {
        const initialCoinRelease = new Transaction(MINT_PUBLIC_ADDRESS, publicKey, 100000);

        this.chain = [new Block('', [initialCoinRelease])];
        this.difficulty = 1;
        this.blockTime = 30000;
        this.transactions = [];
        this.reward = 400;
    }

    getLastBlock() {
        return this.chain[this.chain.length - 1];
    }

    getBalance(address) {
        let balance = 0;

        this.chain.forEach(block => {
            block.data.forEach(transaction => {
                if (transaction.from === address) {
                    balance -= transaction.amount;
                    balance -= transaction.gas;
                }

                if (transaction.to === address) {
                    balance += transaction.amount;
                }
            })
        });

        return balance;
    }

    addBlock(block) {
        block.previousHash = this.getLastBlock().hash;
        block.hash = Block.getHash(block);

        block.mine(this.difficulty);

        this.chain.push(block);

        this.difficulty = Date.now() - this.getLastBlock().timestamp > this.blockTime ? this.difficulty - 1 : this.difficulty + 1; 
    }

    addTransaction(transaction) {
        if (Transaction.isValid(transaction, this)) {
            this.transactions.push(transaction);
        }
    }

    mineTransactions(rewardAddress) {
        let gas = 0;

        this.transactions.forEach(transaction => {
            gas += transaction.gas;
        });

        const rewardTransaction = new Transaction(MINT_PUBLIC_ADDRESS, rewardAddress, this.reward + gas);
        rewardTransaction.sign(MINT_KEY_PAIR);

        // Prevent people from minting coins and mine the minting transaction.
        if (this.transactions.length !== 0) {
            this.addBlock(new Block(new Date().toISOString(), [rewardTransaction, ...this.transactions]));
        }

        this.transactions = [];
    }

    static isValid(blockchain) {
        for (let i = 1; i < blockchain.chain.length; i++) {
            const currentBlock = blockchain.chain[i];
            const previousBlock = blockchain.chain[i - 1];

            if (
                currentBlock.hash !== Block.getHash(currentBlock) ||
                previousBlock.hash !== currentBlock.previousHash ||
                !Block.hasValidTransactions(currentBlock, blockchain)
            ) {
               return false;
            }
        }

        return true;
    }
}

export class Transaction {
    constructor(from, to, amount, gas = 0) {
        this.from = from;
        this.to = to;
        this.amount = amount;
        this.gas = gas;
    }

    sign(keyPair) {
        if (keyPair.getPublic('hex') === this.from) {
            this.signature = keyPair.sign(SHA256(this.from + this.to + this.amount + this.gas), 'base64').toDER('hex');
        }
    }

    static isValid(tx, chain) {
        return (
            tx.from &&
            tx.to &&
            tx.amount &&
            (chain.getBalance(tx.from) >= tx.amount + tx.gas || tx.from === MINT_PUBLIC_ADDRESS) &&
            ec.keyFromPublic(tx.from, 'hex').verify(SHA256(tx.from + tx.to + tx.amount + tx.gas), tx.signature)
        )
    }
}

export const BlockChain = new Blockchain();
