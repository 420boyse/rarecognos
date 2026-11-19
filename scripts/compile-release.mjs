import fs from "node:fs";
import solc from "solc";
import { encodeDeployData, getCreate2Address, keccak256, stringToHex } from "viem";

const name = process.argv[2] || "MidnightRogues";
if (!["MidnightRogues", "LiteForgeMarket"].includes(name)) throw Error("Unknown release");
const market = name === "LiteForgeMarket";
const source = name + ".sol";
const input = {
  language: "Solidity",
  sources: { [source]: { content: fs.readFileSync("contracts/" + source, "utf8") } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "shanghai",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } } },
};
const result = JSON.parse(solc.compile(JSON.stringify(input), {
  import: (path) => ({ contents: fs.readFileSync("node_modules/" + path, "utf8") }),
}));
const errors = result.errors?.filter((e) => e.severity === "error");
if (errors?.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
const contract = result.contracts[source][name];
const proxy = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const owner = "0xfFd9618E19Fb7f74169f75343550E14b74d19CB3";
const { treasury } = JSON.parse(fs.readFileSync("config/eyed.json", "utf8"));
const initCode = encodeDeployData({ abi: contract.abi, bytecode: "0x" + contract.evm.bytecode.object, args: market ? [treasury] : [owner, treasury] });
const salt = keccak256(stringToHex(market ? "RareCognos/LiteForgeMarket/v1" : "RareCognos/MIDNIGHT ROGUES/v1"));
const address = getCreate2Address({ from: proxy, salt, bytecode: initCode });
const runtimeHash = keccak256("0x" + contract.evm.deployedBytecode.object);
fs.writeFileSync(market ? "config/liteforge-market.json" : "config/midnight-rogues.json", JSON.stringify({ owner, treasury, proxy, salt, address, runtimeHash }, null, 2) + "\n");
fs.writeFileSync("public/contracts/" + name + ".json", JSON.stringify({ initCode }) + "\n");
