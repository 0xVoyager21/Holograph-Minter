import ethers from "ethers";
import fs from "fs";
import logger from "./logger.js";
class Config {
    constructor(jsonConfig) {
        this.contractAddress = jsonConfig.contractAddress;
        this.providerUrl = jsonConfig.providerUrl;
        this.privateKeyFilePath = jsonConfig.privateKeyFilePath;
        this.contractAbiPath = jsonConfig.contractAbiPath;
        this.pause = jsonConfig.pause;
        this.order = jsonConfig.order;
    }
}
class Minter {
    constructor(config) {
        this.config = config;
        this.provider = new ethers.providers.JsonRpcProvider(this.config.providerUrl);
        const keys = this.getPrivateKeys();
        this.privateKeys = keys.orderedPrivateKeys;
        this.notShuffledKeys = keys.allPrivateKeys;
        this.contract = this.getContract();
    }
    getPrivateKeys() {
        let allPrivateKeys = fs.readFileSync(this.config.privateKeyFilePath, 'utf-8').split('\n').map(wallet => wallet.trim());
        let orderedPrivateKeys = this.config.order.map(index => allPrivateKeys[index - 1]); // -1 because index starts from 0
        return { orderedPrivateKeys, allPrivateKeys };
    }
    getContract() {
        const contractABI = JSON.parse(fs.readFileSync(this.config.contractAbiPath, 'utf8'));
        return new ethers.Contract(this.config.contractAddress, contractABI, this.provider);
    }
    sleep(min, max) {
        let sleepTime = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
        logger.info(`Sleeping for ${sleepTime / 1e3} seconds...`);
        return new Promise(resolve => setTimeout(resolve, sleepTime));
    }
    async getAdjustedGasPrice() {
        let gasPrice = ethers.utils.formatUnits(await this.provider.getGasPrice(), 'gwei');
        while (Number(gasPrice) > 270) {
            await this.sleep(5, 6); // Check again after 60 to 120 seconds
            gasPrice = ethers.utils.formatUnits(await this.provider.getGasPrice(), 'gwei');
        }
        return gasPrice;
    }
    async mint() {
        for (let privateKey of this.privateKeys) {
            try {
                const wallet = new ethers.Wallet(privateKey, this.provider);
                const contractWithSigner = this.contract.connect(wallet);
                const accountLineNumber = this.notShuffledKeys.indexOf(privateKey) + 1;
                let randomTimes = Math.floor(Math.random() * (20 - 5 + 1)) + 5;
                for (let i = 0; i < randomTimes; i++) {
                    const gasPrice = await this.getAdjustedGasPrice();
                    const maxPriorityFeePerGas = parseFloat((Math.random() * (40 - 30) + 30).toFixed(7));
                    const tx = await contractWithSigner.purchase(1, {
                        maxPriorityFeePerGas: ethers.utils.parseUnits(maxPriorityFeePerGas.toString(), 'gwei'),
                        maxFeePerGas: ethers.utils.parseUnits((parseFloat(gasPrice) * 1.2).toFixed(7).toString(), 'gwei')
                    });
                    logger.info(`| ${accountLineNumber} | Transaction hash: ${tx.hash}`);
                    const receipt = await tx.wait();
                    logger.success(`| ${accountLineNumber} |Transaction was mined in block:  ${receipt.blockNumber}`);
                    // Pause between each call
                    await this.sleep(10, 30);
                }
            }
            catch (error) {
                if (error.code === "UNPREDICTABLE_GAS_LIMIT") {
                    logger.error(`Not enough native for the transaction`);
                    continue;
                }
                else {
                    logger.error(`An error occurred: ${error}`);
                }
            }
            // Pause between wallets
            await this.sleep(this.config.pause.min, this.config.pause.max);
            console.log("\n\n");
        }
    }
}
async function main() {
    // Load the configuration from the JSON file
    const configFile = fs.readFileSync('./config.json');
    const jsonConfig = JSON.parse(configFile.toString());
    const config = new Config(jsonConfig);
    const minter = new Minter(config);
    minter.mint();
}
main();
//# sourceMappingURL=index.js.map