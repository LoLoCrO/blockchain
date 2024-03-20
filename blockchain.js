import crypto from 'crypto';

function SHA256(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

class Block {
    constructor(timestamp, data, previousHash = '') {
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
}

class Blockchain {
    constructor() {
        this.chain = [new Block(new Date().toISOString(), 'Genesis Block', '0')];
        this.difficulty = 1;
        this.blockTime = 30000;
    }

    getLastBlock() {
        return this.chain[this.chain.length - 1];
    }

    addBlock(newBlock) {
        newBlock.previousHash = this.getLastBlock().hash;
        newBlock.hash = newBlock.getHash();

        newBlock.mine(this.difficulty);

        this.chain.push(newBlock);

        this.difficulty = Date.now() - this.getLastBlock().timestamp > this.blockTime ? this.difficulty - 1 : this.difficulty + 1; 
    }

    isValid(blockchain = this) {
        for (let i = 1; i < blockchain.chain.length; i++) {
            const currentBlock = blockchain.chain[i];
            const previousBlock = blockchain.chain[i - 1];

            if (currentBlock.hash !== currentBlock.getHash() || currentBlock.previousHash !== previousBlock.hash) {
               return false;
            }
        }

        return true;
    }
}

const BlockChain = new Blockchain();

BlockChain.addBlock(new Block(new Date().toISOString(), { amount: 1 }));
BlockChain.addBlock(new Block(new Date().toISOString(), { amount: 2 }));
BlockChain.addBlock(new Block(new Date().toISOString(), { amount: 3 }));
BlockChain.addBlock(new Block(new Date().toISOString(), { amount: 4 }));
BlockChain.addBlock(new Block(new Date().toISOString(), { amount: 5 }));

console.log(BlockChain);
 