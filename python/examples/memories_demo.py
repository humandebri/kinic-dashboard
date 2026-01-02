"""Example usage of the Kinic Python wrapper.

Run with:
    uv run python python/examples/memories_demo.py --identity default --memory-id <canister>
"""

from __future__ import annotations

import argparse

from kinic_py import KinicMemories


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Kinic Python wrapper demo")
    parser.add_argument("--identity", required=True, help="keychain identity name")
    parser.add_argument("--memory-id", required=False, help="existing canister to use")
    parser.add_argument("--ic", action="store_true", help="talk to mainnet instead of local replica")
    parser.add_argument("--tag", default="demo", help="tag to store with inserted text")
    parser.add_argument("--text", default="Hello from Python!", help="text to insert if --memory-id provided")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    km = KinicMemories(args.identity, ic=args.ic)

    if args.memory_id:
        print(f"Searching {args.memory_id}...")
        results = km.search(args.memory_id, "Hello")
        for score, text in results:
            print(f"- [{score:.4f}] {text}")
    else:
        canister_id = km.create("Python demo", "Created from kinic_py example")
        print(f"Created new memory canister: {canister_id}")

    memories = km.list()
    print("Known memories:")
    for principal in memories:
        print(f"- {principal}")

    if args.memory_id:
        inserted = km.insert_markdown(args.memory_id, args.tag, args.text)
        print(f"Inserted {inserted} chunks into {args.memory_id}")


if __name__ == "__main__":
    main()
