import crypto from 'crypto';
import EC from 'elliptic';

const ec = new EC.ec('secp256k1');

const MINT_KEY_PAIR = ec.genKeyPair();
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic('hex');

const holderKeyPair = ec.genKeyPair();

function SHA256(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

class Block {
    constructor(timestamp, data = [], previousHash = '') {
        this.timestamp = timestamp;
        this.data = data;
        this.hash = this.getHash();
        this.previousHash = previousHash;
        this.nonce = 0;
    }

    getHash() {
        return SHA256(JSON.stringify(this.data) + this.previousHash + this.nonce);
    }

    mine(difficulty) {
        while (!this.hash.startsWith(Array(difficulty + 1).join('0'))) {
            this.nonce++;
            this.hash = this.getHash();
        }
    }

    hasValidTransactions(chain) {
        let gas = 0;
        let reward = 0;

        this.data.forEach(transaction => {
            if (transaction.from !== MINT_PUBLIC_ADDRESS) {
                gas += transaction.gas;
            } else {
                reward = transaction.amount;
            }
        });

        return (
            reward - gas === chain.reward &&
            this.data.every(transaction => transaction.isValid(transaction, chain)) &&
            this.data.filter(transaction => transaction.from === MINT_PUBLIC_ADDRESS).length === 1
        );
    }
}

class Blockchain {
    constructor() {
        const initialCoinRelease = new Transaction(MINT_PUBLIC_ADDRESS, holderKeyPair.getPublic('hex'), 100000);

        this.chain = [new Block(new Date().toISOString(), [initialCoinRelease])];
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

    addBlock(newBlock) {
        newBlock.previousHash = this.getLastBlock().hash;
        newBlock.hash = newBlock.getHash();

        newBlock.mine(this.difficulty);

        this.chain.push(newBlock);

        this.difficulty = Date.now() - this.getLastBlock().timestamp > this.blockTime ? this.difficulty - 1 : this.difficulty + 1; 
    }

    addTransaction(transaction) {
        if (transaction.isValid(transaction, this)) {
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

    isValid(blockchain = this) {
        for (let i = 1; i < blockchain.chain.length; i++) {
            const currentBlock = blockchain.chain[i];
            const previousBlock = blockchain.chain[i - 1];

            if (
                currentBlock.hash !== currentBlock.getHash() ||
                previousBlock.hash !== currentBlock.previousHash ||
                !currentBlock.hasValidTransactions(blockchain)
            ) {
               return false;
            }
        }

        return true;
    }
}

class Transaction {
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

    isValid(tx, chain) {
        return (
            tx.from &&
            tx.to &&
            tx.amount &&
            (chain.getBalance(tx.from) >= tx.amount + tx.gas || tx.from === MINT_PUBLIC_ADDRESS && tx.amount === chain.reward) &&
            ec.keyFromPublic(tx.from, 'hex').verify(SHA256(tx.from + tx.to + tx.amount + tx.gas), tx.signature)
        )
    }
}

const BlockChain = new Blockchain();

const wallet1 = ec.genKeyPair();

const transaction = new Transaction(holderKeyPair.getPublic('hex'), wallet1.getPublic('hex'), 333, 10);

transaction.sign(holderKeyPair);
BlockChain.addTransaction(transaction);
BlockChain.mineTransactions(wallet1.getPublic('hex'));

console.log('Targets balance:', BlockChain.getBalance(wallet1.getPublic('hex')));
console.log('Your balance:', BlockChain.getBalance(holderKeyPair.getPublic('hex')));
 