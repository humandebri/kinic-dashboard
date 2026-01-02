import argparse

from kinic_py import KinicMemories


def main() -> None:
    parser = argparse.ArgumentParser(description="Ask AI over a Kinic memory")
    parser.add_argument("--identity", required=True, help="keychain identity name")
    parser.add_argument("--memory-id", required=True, help="memory canister id")
    parser.add_argument("--query", required=True, help="question to ask")
    parser.add_argument("--top-k", type=int, default=3, help="number of top search results to include")
    parser.add_argument("--ic", action="store_true", help="use mainnet instead of local replica")
    parser.add_argument("--language", default="en", help="response language code (default: en)")
    args = parser.parse_args()

    km = KinicMemories(args.identity, ic=args.ic)
    prompt, answer = km.ask_ai(args.memory_id, args.query, top_k=args.top_k, language=args.language)

    print("Prompt sent to LLM:\n")
    print(prompt)
    print("\nAnswer:\n")
    print(answer)


if __name__ == "__main__":
    main()
