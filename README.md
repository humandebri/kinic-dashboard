#  Kinic CLI - Trustless Agentic Memory

**OPEN BETA v0.1** - star, share, and provide feedback :)

Python bindings for the Kinic CLI core, enabling you to build AI agents with verifiable, owned memory on the Internet Computer. Give your agents the memory they can prove, own, and carry anywhere.

**For the wizards building trustless agents** - no more lobotomized summons that reset on every quest.

Looking for the CLI docs? See `docs/cli.md`.

Made with ❤️ by [ICME Labs](https://blog.icme.io/).

<img width="983" height="394" alt="icme_labs" src="https://github.com/user-attachments/assets/ffc334ed-c301-4ce6-8ca3-a565328904fe" />

---

## What is Trustless Agentic Memory?

Traditional AI agents face three critical problems:

1. **Memory Without Proof**: TEEs prove computation, but can't verify the memories your agent retrieved were correct.
2. **Memory Without Ownership**: Your agent's identity is onchain, but its memories live in Pinecone, Weaviate, or other centralized providers.
3. **Payment Without Verification**: With x402, agents can pay for memory retrieval - but can't prove they received the right results.

Kinic solves this with **zkTAM** (zero-knowledge Trustless Agentic Memory):
- ✅ **Verifiable**: zkML proofs for embeddings - no black box vectors
- ✅ **Owned**: Your memory lives on-chain in WASM canisters you control
- ✅ **Portable**: Move your agent's memory between any infrastructure

By default we use the Internet Computer as the DA layer—with VetKey encryption and cross-chain signing (tECDSA). You can run it locally or on any WASM-based DA layer. In future versions, full zkML support will be enabled, allowing for trustless verification on nearly all blockchains.

---

## Prerequisites

- **Python 3.9+**
- **KINIC tokens**: At least 1 KINIC to deploy memory canisters
- **Identity**: Either store a PEM in macOS Keychain (`internet_computer_identity_<IDENTITY_NAME>`) or use Internet Identity login (`kinic-cli login`)

> Note: Do not use the `default` identity with `kinic-cli`—it always fails. Use a named identity instead.

## Local development prerequisites (optional)

These are only required if you want to run a local replica for development/testing.

- **dfx 0.28+** with the `arm64` build on Apple Silicon (macOS)
- Local Internet Computer replica (`dfx start`)

Optional: If you need local launcher/ledger/II canisters, run `./scripts/setup.sh` after `dfx start --clean --background`.

---

## Installation

### From PyPI (Recommended)
```bash
pip install kinic-py

# Or with uv
uv pip install kinic-py
```

### From Source

Requires Rust toolchain for the PyO3 extension:
```bash
pip install -e .

# Or with uv
uv pip install -e .
```

---

## Quickstart

### 1. Create or Select Your Identity

Choose one of the following:

- **Keychain PEM**: Store your PEM in the macOS keychain entry named `internet_computer_identity_<IDENTITY_NAME>`, then use that identity name in CLI/Python calls.
- **Internet Identity** (CLI only): Run `kinic-cli login` once to save a delegation, then pass `--ii` on CLI commands.

Example: use `IDENTITY_NAME` wherever you see `<name>` below.

### 2. Check Your Balance

Make sure you have at least 1 KINIC token:
```bash
cargo run -- --identity <name> balance
```
This prints your principal and balance (base units: `100000000 = 1 KINIC`).

### Internet Identity login (CLI only)

If you prefer browser login instead of a keychain PEM:

```bash
cargo run -- login
cargo run -- --ii list
```

Delegations are stored at `~/.config/kinic/identity.json` (default TTL: 30 days).
The login flow uses a local callback on port `8620` (override with `--callback-port`).

Python option (balance only):
```python
from kinic_py import get_balance
base, kinic = get_balance("<identity name>", ic=True)
```
**DM https://x.com/wyatt_benno for KINIC prod tokens** with your principal ID.

Or purchase them from MEXC or swap at https://app.icpswap.com/ . 

### 3. Deploy and Use Memory

```python
from kinic_py import KinicMemories

km = KinicMemories("<identity name>")  # keychain identity name; use ic=True for mainnet, e.g. KinicMemories("<name>", ic=True)
memory_id = km.create("Python demo", "Created via kinic_py")
tag = "notes"
markdown = "# Hello Kinic!\n\nInserted from Python."

km.insert_markdown(memory_id, tag, markdown)

for score, payload in km.search(memory_id, "Hello"):
    print(f"{score:.4f} -> {payload}")  # payload is the JSON stored in insert
```

You can tag inserted content (e.g., `notes`, `summary_q1`) and manage it later by tag.

---

## Insert a PDF

Python (preferred: `insert_pdf_file`):
```python
num_chunks = km.insert_pdf_file(memory_id, "quarterly_report", "./docs/report.pdf")
print(f"Inserted {num_chunks} PDF chunks")
```

The deprecated `insert_pdf(...)` alias still works, but `insert_pdf_file(...)` is the canonical API.

See `python/examples/insert_pdf_file.py` for a runnable script.

---

## Ask AI

Runs a search and prepares context for an AI answer. The CLI calls `/chat` at `EMBEDDING_API_ENDPOINT` (default `https://api.kinic.io`) and prints only the `<answer>` text.

```python
prompt, answer = km.ask_ai(memory_id, "What did we say about quarterly goals?", top_k=3, language="en")
print("Prompt:\n", prompt)
print("Answer:\n", answer)
```

- `km.ask_ai` returns `(prompt, answer)` where `answer` is the `<answer>` section from the chat response.
- CLI usage: `cargo run -- --identity <name> ask-ai --memory-id <id> --query "<q>" --top-k 3`

---

## Configure memory visibility

You can control who can read or write a memory canister—either everyone (`anonymous`) or specific principals—and assign `reader` or `writer` roles.

Python example:
```python
from kinic_py import KinicMemories

km = KinicMemories("<identity>")

# Grant reader access to everyone (anonymous)
km.add_user("<memory canister id>", "anonymous", "reader")

# Grant writer access to a specific principal
km.add_user("<memory canister id>", "w7x7r-cok77-7x4qo-hqaaa-aaaaa-b", "writer")
```

CLI example:
```bash
# Give everyone reader access
cargo run -- --identity <name> config \
  --memory-id <memory canister id> \
  --add-user anonymous reader

# Grant writer access to a specific principal
cargo run -- --identity <name> config \
  --memory-id <memory canister id> \
  --add-user w7x7r-cok77-7x4qo-hqaaa-aaaaa-b writer
```

Notes:
- `anonymous` applies to everyone; admin cannot be granted to anonymous.
- Roles: `admin` (1), `writer` (2), `reader` (3).
- Principals are validated; invalid text fails fast.

---

## Update a memory canister (CLI)

Trigger the launcher’s `update_instance` for a given memory id:
```bash
cargo run -- --identity <name> update \
  --memory-id <memory canister id>
```

## Check token balance (CLI)

Query the ledger for the current identity’s balance (base units):
```bash
cargo run -- --identity <name> balance
```

---

## API Reference

### Class: `KinicMemories`

Stateful helper that mirrors the CLI behavior.
```python
KinicMemories(identity: str, ic: bool = False)
```

**Parameters:**
- `identity`: Your keychain identity name (PEM stored as `internet_computer_identity_<IDENTITY_NAME>`)
- `ic`: Set `True` to target mainnet (default: `False` for local)

### Methods

#### `create(name: str, description: str) -> str`
Deploy a new memory canister.

**Returns:** Canister principal (memory_id)

#### `list() -> List[str]`
List all memory canisters owned by your identity.

#### `insert_markdown(memory_id: str, tag: str, text: str) -> int`
Embed and store markdown text with zkML verification.

**Returns:** Number of chunks inserted

#### `insert_markdown_file(memory_id: str, tag: str, path: str) -> int`
Embed and store markdown from a file.

**Returns:** Number of chunks inserted

#### `insert_pdf_file(memory_id: str, tag: str, path: str) -> int`
Convert a PDF to markdown and insert it.

**Returns:** Number of chunks inserted

#### `search(memory_id: str, query: str) -> List[Tuple[float, str]]`
Search memories with semantic similarity.

**Returns:** List of `(score, payload)` tuples sorted by relevance

#### `ask_ai(memory_id: str, query: str, top_k: int | None = None, language: str | None = None) -> Tuple[str, str]`
Run the Ask AI flow: search, build an LLM prompt, and return `(prompt, answer)` where `answer` is the `<answer>` section from the chat endpoint.

**Parameters:** `top_k` (defaults to 5), `language` code (e.g., `"en"`)

#### `balance() -> Tuple[int, float]`
Return the current identity’s balance as `(base_units, kinic)`.

#### `update(memory_id: str) -> None`
Trigger `update_instance` via the launcher for the given memory canister.

### Module-Level Functions

Stateless alternatives available:
- `create_memory(identity, name, description, ic=False)`
- `list_memories(identity, ic=False)`
- `insert_markdown(identity, memory_id, tag, text, ic=False)`
- `insert_markdown_file(identity, memory_id, tag, path, ic=False)`
- `insert_pdf_file(identity, memory_id, tag, path, ic=False)`
- `insert_pdf(identity, memory_id, tag, path, ic=False)`
- `search_memories(identity, memory_id, query, ic=False)`
- `ask_ai(identity, memory_id, query, top_k=None, language=None, ic=False)`
- `get_balance(identity, ic=False)`
- `update_instance(identity, memory_id, ic=False)`

---

## Example: Full Demo Script

Run the complete example at `python/examples/memories_demo.py`:
```bash
# With existing memory
uv run python python/examples/memories_demo.py \
  --identity <name> \
  --memory-id <memory canister id>

# Deploy new memory
uv run python python/examples/memories_demo.py --identity <name>

# Use mainnet
uv run python python/examples/memories_demo.py --identity <name> --ic
```

Ask AI example at `python/examples/ask_ai.py`:
```bash
uv run python python/examples/ask_ai.py \
  --identity <name> \
  --memory-id <memory canister id> \
  --query "What is xxxx?" \
  --top-k 3
```

---

## Use Cases

### ERC-8004 Agents
Build agents with verifiable memory that works with the ERC-8004 trust model:
```python
km = KinicMemories("agent-identity", ic=True)
memory_id = km.create("Trading Agent Memory", "Market analysis and decisions")

# Store verified context
km.insert_markdown(memory_id, "analysis", market_report)

# Retrieve with proof
results = km.search(memory_id, "BTC trend analysis")
```

### x402 Payment Integration WIP
Agents can pay for memory operations with verifiable results:
```python
# Agent pays for retrieval via x402
# Memory operations return zkML proofs
# Agent can verify it received correct embeddings for payment
```

---

## Building the Wheel

See `docs/python-wheel.md` for packaging, testing, and PyPI upload instructions.

---

## Get Production Tokens

Ready to deploy on mainnet? **DM https://x.com/wyatt_benno for KINIC prod tokens** and start building agents with trustless memory.

---

## Learn More

- **Blog Post**: [Trustless AI can't work without Trustless AI Memory](https://blog.icme.io/trustless-agents-cant-work-without-trustless-agentic-memory/)
- **Vectune**: WASM-based vector database
- **[JOLT Atlas](https://github.com/ICME-Lab/jolt-atlas)**: zkML framework for embedding verification

---

**Built by wizards, for wizards.** 🧙‍♂️✨

Stop building lobotomized agents. Start building with memory they can prove.
