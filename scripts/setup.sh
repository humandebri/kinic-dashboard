#!/bin/bash
set -e  # Stop script on errors
# set -x  # Print commands for debugging
set -o pipefail  # Fail on pipeline errors

## -- Ledger --
USER_NAME=$(dfx identity whoami)
echo "Current user: ${USER_NAME}"

dfx identity use default 

# Set environment variables
export DEFAULT=$(dfx identity get-principal)
export TOKEN_NAME="My Token"
export TOKEN_SYMBOL="XMTK"
export PRE_MINTED_TOKENS=10_000_000_000
export TRANSFER_FEE=100_000
export ARCHIVE_CONTROLLER=$(dfx identity get-principal)
export TRIGGER_THRESHOLD=2000
export NUM_OF_BLOCK_TO_ARCHIVE=1000
export CYCLE_FOR_ARCHIVE_CREATION=10000000000000
export FEATURE_FLAGS=true

# Deploy ledger canister
dfx deploy icrc1_ledger_canister --specified-id 73mez-iiaaa-aaaaq-aaasq-cai --argument "(variant {Init =
record {
     token_symbol = \"${TOKEN_SYMBOL}\";
     token_name = \"${TOKEN_NAME}\";
     minting_account = record { owner = principal \"${DEFAULT}\" };
     transfer_fee = ${TRANSFER_FEE};
     metadata = vec {};
     feature_flags = opt record{icrc2 = ${FEATURE_FLAGS}};
     initial_balances = vec { record { record { owner = principal \"${DEFAULT}\"; }; ${PRE_MINTED_TOKENS}; }; };
     archive_options = record {
         num_blocks_to_archive = ${NUM_OF_BLOCK_TO_ARCHIVE};
         trigger_threshold = ${TRIGGER_THRESHOLD};
         controller_id = principal \"${ARCHIVE_CONTROLLER}\";
         cycles_for_archive_creation = opt ${CYCLE_FOR_ARCHIVE_CREATION};
     };
 }
})"

# Switch back to original identity
dfx identity use "${USER_NAME}"


dfx deploy internet_identity --specified-id rdmx6-jaaaa-aaaaa-aaadq-cai
dfx deploy launcher --specified-id xfug4-5qaaa-aaaak-afowa-cai --argument='(variant {minor})'
# dfx canister call launcher change_key_id '("test_key_1")'
dfx ledger fabricate-cycles --cycles 100T --canister $(dfx canister id launcher)

dfx identity use $USER_NAME

sh scripts/mint.sh $(dfx identity get-principal) 100

