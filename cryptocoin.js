import 'dotenv/config'

import { createRequire } from 'module';
const re = createRequire(import.meta.url);

const WebSocket = re('ws');

import crypto from 'crypto';
import ecliptic from 'elliptic';
import {
    Block,
    Blockchain,
    Transaction,
    BlockChain,
} from './blockchain.js';

function SHA256(message) {
    return crypto.createHash('sha256').update(message).digest('hex');
}

const EC = ecliptic.ec;
const ec = new EC('secp256k1');

const MINT_KEY_PAIR = ec.keyFromPrivate(process.env.MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

const keyPair = ec.keyFromPrivate(process.env.privateKey, "hex");
const publicKey = keyPair.getPublic("hex");

const PORT = 3000;
const PEERS = [];
const MY_ADDRESS = `ws://localhost:${PORT}`;

const server = new WebSocket.Server({ port: PORT });

let opened = [], connected = [];
let check = [];
let checked = [];
let checking = false;

let tempChain = new Blockchain();

async function connect(address) {
    console.log('Connecting to', address);
    if (!connected.includes(address) && address !== MY_ADDRESS) {
        const socket = new WebSocket.Server(address);

        socket.on('open', () => {
            socket.send(JSON.stringify({ type: 'HANDLE_HANDSHAKE', nodes: [MY_ADDRESS, ...connected] }));

            if (!opened.includes(address) && address !== MY_ADDRESS) {
                opened.push(address);
            }
    
            if (!connected.includes(address) && address !== MY_ADDRESS) {
                connected.push(address);
            }
        });

        socket.on('close', () => {
            opened.splice(opened.indexOf(address), 1);
            connected.splice(connected.indexOf(address), 1);
        });
    }
};

function formatMessage(type, data) {
    return { type, data };
}

function sendMessage(message) {
    opened.forEach(node => {
        node.socket.send(JSON.stringify(message));
    });
}

server.on('connection', async (socket, req) => {
    console.log('Connected to', req.url, 'PORT:', PORT);
    socket.on('message', async message => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'TYPE_CREATE_TRANSACTION':
                const transaction = data.transaction;

                if (Transaction.isValid(transaction, blockchain)) {
                    BlockChain.addTransaction(transaction);
                }
                break;
            case 'TYPE_REPLACE_CHAIN':
                const [newBlock, newDifficulty] = data.message;

                const ourTx = [...BlockChain.transactions.map(tx => JSON.stringify(tx))];
                const theirTx = [...newBlock.data.filter(tx => tx.from !== MINT_PUBLIC_ADDRESS).map(tx => JSON.stringify(tx))];
                const n = theirTx.length;

                if (newBlock.previousHash !== BlockChain.getLastBlock().hash) {
                    for (let i = 0; i < n; i++) {
                        const index = ourTx.indexOf(theirTx[0]);

                        if (index === -1) break;

                        ourTx.splice(index, 1);
                        theirTx.splice(0, 1);
                    }

                    if (
                        theirTx.length ===  0 &&
                        SHA256(BlockChain.getLastBlock().hash + newBlock.timestamp + JSON.stringify(newBlock.data) + newBlock.nonce) === newBlock.hash &&
                        newBlock.hash.startsWith(Array(BlockChain.difficulty + 1).join('0')) &&
                        Block.hasValidTransactions(newBlock, BlockChain) &&
                        (parseInt(newBlock.timestamp) > parseInt(BlockChain.getLastBlock().timestamp) || BlockChain.getLastBlock().timestamp === "") &&
                        parseInt(newBlock.timestamp) < Date.now() &&
                        BlockChain.getLastBlock().hash === newBlock.previousHash &&
                        (newDifficulty + 1 === BlockChain.difficulty || newDifficulty - 1 === BlockChain.difficulty)
                    ) {
                        BlockChain.chain.push(newBlock);
                        BlockChain.difficulty = newDifficulty;
                        BlockChain.transactions = [...ourTx.map(tx => JSON.parse(tx))];
                    } else if (!checked.includes(JSON.stringify([BlockChain.getLastBlock().previousHash, BlockChain.chain[BlockChain.chain.length - 2].timestamp]))) {
                        checked.push(JSON.stringify([BlockChain.getLastBlock().previousHash, BlockChain.chain[BlockChain.chain.length - 2].timestamp]));

                        const position = BlockChain.chain.length - 1;

                        checking = true;

                        sendMessage(formatMessage('TYPE_REQUEST_CHECK', MY_ADDRESS));

                        setTimeout(() => {
                            checking = false;

                            let mostAppeared = check[0];

                            check.forEach(group => {
                                if (group.filter(g => g === group).length > check.filter(g => g === mostAppeared).length) {
                                    mostAppeared = group;
                                }
                            });

                            const group = JSON.parse(mostAppeared);

                            BlockChain.chain[position] = group[0];
                            BlockChain.transactions = [...group[1]];
                            BlockChain.difficulty = group[2];

                            check.splice(0, check.length);
                        }, 5000);
                    }
                }
                break;
            case 'TYPE_REQUEST_CHECK':
                opened.filter(node => node.address === data.data)[0]
                    .socket.send(JSON.stringify({
                        type: 'TYPE_SEND_CHECK',
                        data: JSON.stringify([
                            BlockChain.getLastBlock(),
                            BlockChain.transactions,
                            BlockChain.difficulty
                        ])
                    }));

                break;
            case 'TYPE_SEND_CHECK':
                if (checking) check.push(data);
                break;
            case 'TYPE_REQUEST_CHAIN':
                socket.send(JSON.stringify({
                    type: 'TYPE_SEND_CHAIN',
                    data: JSON.stringify(BlockChain.chain)
                }));
                break;
            case 'HANDLE_HANDSHAKE':
                const socket = opened.filter(node => node.address === data.data)[0].socket;

                BlockChain.chain.forEach((block, index) =>
                    socket.send(JSON.stringify({
                        type: 'TYPE_SEND_CHAIN',
                        data: {
                            block,
                            fininshed: index === BlockChain.chain.length
                        }
                    })));
                break;
            case 'TYPE_SEND_CHAIN':
                const { block, fininshed } = JSON.parse(data.data);

                if (!fininshed) {
                    tempChain.chain.push(block);
                } else {
                    if (Blockchain.isValid(tempChain)) {
                        BlockChain.chain = tempChain.chain;
                    }
                    
                    tempChain = new Blockchain();
                }
                break;
            case 'TYPE_REQUEST_INFO':
                opened.filter(node => node.address === data.data)[0]
                    .socket.send(JSON.stringify({
                        type: 'TYPE_SEND_INFO',
                        data: [
                            BlockChain.difficulty,
                            BlockChain.transaction,
                        ]
                    }));
                break;
            case 'TYPE_SEND_INFO':
                const [difficulty, transactions] = data.data;

                if (difficulty > BlockChain.difficulty) {
                    BlockChain.difficulty = difficulty;
                    BlockChain.transactions = transactions;
                }
                break;
        }
    });
});

server.on('error', error => {
    console.error('Server error:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

PEERS.forEach(peer => connect(peer));

setTimeout(() => {
    const transaction = new Transaction(
            publicKey,
            '046856ec283a5ecbd040cd71383a5e6f6ed90ed2d7e8e599dbb5891c13dff26f2941229d9b7301edf19c5aec052177fac4231bb2515cb59b1b34aea5c06acdef43',
            200,
            10
        );

    transaction.sign(keyPair);

	sendMessage({
        type: 'TYPE_CREATE_TRANSACTION',
        data: transaction,
    });

	BlockChain.addTransaction(transaction);
}, 5000);

setTimeout(() => {
    console.log(opened);
    console.log(BlockChain.chain);
}, 10000);