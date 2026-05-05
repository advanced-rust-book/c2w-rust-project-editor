import { DEFAULT_CODES_CH09 } from "./default-codes-ch09"
import { DEFAULT_CODES_CH10 } from "./default-codes-ch10"
import { DEFAULT_CODES_CH11 } from "./default-codes-ch11"
import { DEFAULT_CODES_CH12 } from "./default-codes-ch12"
import { DEFAULT_CODES_CH13 } from "./default-codes-ch13"
import { DEFAULT_CODES_CH14 } from "./default-codes-ch14"
import { DEFAULT_CODES_CH15 } from "./default-codes-ch15"
import { DEFAULT_CODES_CH16 } from "./default-codes-ch16"
import { DEFAULT_CODES_CH17 } from "./default-codes-ch17"
import { DEFAULT_CODES_CH18 } from "./default-codes-ch18"
import { DEFAULT_CODES_CH19 } from "./default-codes-ch19"
import { DEFAULT_CODES_CH20 } from "./default-codes-ch20"
import { DEFAULT_CODES_CH21 } from "./default-codes-ch21"
import { DEFAULT_CODES_CH22 } from "./default-codes-ch22"
import { DEFAULT_CODES_CH23 } from "./default-codes-ch23"
import { DEFAULT_CODES_CH24 } from "./default-codes-ch24"
import { DEFAULT_CODES_CH25 } from "./default-codes-ch25"
import { DEFAULT_CODES_CH26 } from "./default-codes-ch26"
import { DEFAULT_CODES_CH27 } from "./default-codes-ch27"
import { DEFAULT_CODES_CH28 } from "./default-codes-ch28"
import { DEFAULT_CODES_CH29 } from "./default-codes-ch29"
import { DEFAULT_CODES_CH30 } from "./default-codes-ch30"
import { DEFAULT_CODES_CH31 } from "./default-codes-ch31"
import { DEFAULT_CODES_CH32 } from "./default-codes-ch32"
import { DEFAULT_CODES_CH33 } from "./default-codes-ch33"
import { DEFAULT_CODES_CH34 } from "./default-codes-ch34"
import { DEFAULT_CODES_CH35 } from "./default-codes-ch35"
import { DEFAULT_CODES_CH36 } from "./default-codes-ch36"
import { DEFAULT_CODES_CH37 } from "./default-codes-ch37"
import { DEFAULT_CODES_CH38 } from "./default-codes-ch38"
import { DEFAULT_CODES_CH39 } from "./default-codes-ch39"
import { DEFAULT_CODES_CH40 } from "./default-codes-ch40"
import { DEFAULT_CODES_CH41 } from "./default-codes-ch41"
import { DEFAULT_CODES_CH42 } from "./default-codes-ch42"
import { DEFAULT_CODES_CH43 } from "./default-codes-ch43"
import { DEFAULT_CODES_CH44 } from "./default-codes-ch44"
import { DEFAULT_CODES_CH45 } from "./default-codes-ch45"
import { DEFAULT_CODES_CH46 } from "./default-codes-ch46"
import { DEFAULT_CODES_CH47 } from "./default-codes-ch47"
import { DEFAULT_CODES_CH48 } from "./default-codes-ch48"
import { DEFAULT_CODES_CH49 } from "./default-codes-ch49"
import { DEFAULT_CODES_CH50 } from "./default-codes-ch50"
import { DEFAULT_CODES_CH51 } from "./default-codes-ch51"
import { DEFAULT_CODES_CH52 } from "./default-codes-ch52"
import { DEFAULT_CODES_CH53 } from "./default-codes-ch53"
import { DEFAULT_CODES_CH54 } from "./default-codes-ch54"

export interface PageConfig {
  id: string
  title: string
  shortTitle: string
  description: string
  icon: string
  codeKeys?: string[]
}

export interface ChapterConfig {
  id: string
  title: string
  icon: string
  pages: PageConfig[]
}

export const CHAPTERS: ChapterConfig[] = [
  {
    id: "ch01-why-rust-feels-different",
    title: "Chapter 01 · Why Rust Feels Different",
    icon: "book",
    pages: [
      {
        id: "ch01-why-rust-feels-different",
        title: "Why Rust Feels Different",
        shortTitle: "Why Rust Feels Different",
        description: "Control without unsafety by default, zero-cost abstractions, and compiler-guided design",
        icon: "book",
        codeKeys: ["why_rust_pipeline", "why_rust_thread_handoff"],
      },
      {
        id: "ch01-why-rust-feels-different-exercises",
        title: "Chapter 01 Exercises",
        shortTitle: "Exercises",
        description: "Progressive drills on diagnostics, tradeoffs, and Rust-first design",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch02-the-rust-mental-model",
    title: "Chapter 02 · The Rust Mental Model",
    icon: "book",
    pages: [
      {
        id: "ch02-the-rust-mental-model",
        title: "The Rust Mental Model",
        shortTitle: "Mental Model",
        description: "Values, bindings, moves, drops, stack versus heap, expressions, RAII, and lifetimes",
        icon: "book",
        codeKeys: ["mental_model_move_drop", "mental_model_blocks_heap"],
      },
      {
        id: "ch02-the-rust-mental-model-exercises",
        title: "Chapter 02 Exercises",
        shortTitle: "Exercises",
        description: "Predict ownership behavior, reason about allocation, and practice expression-oriented Rust",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch03-project-structure-and-tooling",
    title: "Chapter 03 · Project Structure and Tooling",
    icon: "package",
    pages: [
      {
        id: "ch03-project-structure-and-tooling",
        title: "Project Structure and Tooling",
        shortTitle: "Structure and Tooling",
        description: "Cargo, crates, workspaces, modules, features, dependencies, and a practical workflow",
        icon: "package",
        codeKeys: ["project_structure_module_visibility", "project_structure_feature_flags"],
      },
      {
        id: "ch03-project-structure-and-tooling-exercises",
        title: "Chapter 03 Exercises",
        shortTitle: "Exercises",
        description: "Design workspace layout, feature matrices, dependency policy, and the command pack for CI",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch04-ownership-borrowing-and-lifetimes",
    title: "Chapter 04 · Ownership, Borrowing, and Lifetimes",
    icon: "book",
    pages: [
      {
        id: "ch04-ownership-borrowing-and-lifetimes",
        title: "Ownership, Borrowing, and Lifetimes",
        shortTitle: "Ownership and Lifetimes",
        description: "Ownership as the core design tool, borrowing rules, lifetimes, elision, and ownership-shaped APIs",
        icon: "book",
        codeKeys: ["ownership_borrowing_shared_mutable", "ownership_borrowing_lifetimes"],
      },
      {
        id: "ch04-ownership-borrowing-and-lifetimes-exercises",
        title: "Chapter 04 Exercises",
        shortTitle: "Exercises",
        description: "Repair borrow-checker failures, annotate lifetimes only where needed, and design borrowed-input APIs",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch05-ownership-inside-structs",
    title: "Chapter 05 · Pointers, References, and Ownership Inside Structs",
    icon: "book",
    pages: [
      {
        id: "ch05-ownership-inside-structs",
        title: "Pointers, References, and Ownership Inside Structs",
        shortTitle: "Ownership Inside Structs",
        description: "Owned fields, borrowed fields, Box/Rc/Arc, owned buffers with views, and safe alternatives to self-references",
        icon: "book",
        codeKeys: ["ownership_structs_owned_views", "ownership_structs_pointer_choices"],
      },
      {
        id: "ch05-ownership-inside-structs-exercises",
        title: "Chapter 05 Exercises",
        shortTitle: "Exercises",
        description: "Choose field ownership, avoid lifetime-heavy structs, expose safe views, and replace self-references with stable layouts",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch06-ownership-inside-vectors",
    title: "Chapter 06 · Pointers, References, and Ownership Inside Vectors",
    icon: "book",
    pages: [
      {
        id: "ch06-ownership-inside-vectors",
        title: "Pointers, References, and Ownership Inside Vectors",
        shortTitle: "Ownership Inside Vectors",
        description:
          "Vec<T> ownership, reference invalidation, reallocation hazards, index handles, stable-address patterns, slices, and safe mutation while iterating",
        icon: "book",
        codeKeys: ["ownership_vectors_indices", "ownership_vectors_boxed_stable"],
      },
      {
        id: "ch06-ownership-inside-vectors-exercises",
        title: "Chapter 06 Exercises",
        shortTitle: "Exercises",
        description:
          "Repair reallocation hazards, switch from references to indices, and mutate vectors safely under production constraints",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch07-copying-data-vs-cloning-data",
    title: "Chapter 07 · Copying Data vs Cloning Data",
    icon: "book",
    pages: [
      {
        id: "ch07-copying-data-vs-cloning-data",
        title: "Copying Data vs Cloning Data",
        shortTitle: "Copy vs Clone",
        description:
          "Move semantics, Copy vs Clone, clone-on-write, Rc/Arc cloning costs, allocation discipline, and receiver choices",
        icon: "book",
        codeKeys: ["copying_data_moves_copy_clone", "copying_data_cow_arc"],
      },
      {
        id: "ch07-copying-data-vs-cloning-data-exercises",
        title: "Chapter 07 Exercises",
        shortTitle: "Exercises",
        description:
          "Classify move/copy/clone operations, implement Clone manually, remove unnecessary clones, and choose Copy safely",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch08-undefined-behavior-and-unsafe-rust",
    title: "Chapter 08 · Undefined Behavior and Unsafe Rust",
    icon: "book",
    pages: [
      {
        id: "ch08-undefined-behavior-and-unsafe-rust",
        title: "Undefined Behavior and Unsafe Rust",
        shortTitle: "Unsafe Rust",
        description:
          "What Rust considers UB, the role of unsafe, raw pointers, aliasing, data races, uninitialized memory, FFI, and safe abstractions over unsafe internals",
        icon: "book",
        codeKeys: ["unsafe_rust_fill_window", "unsafe_rust_maybe_uninit"],
      },
      {
        id: "ch08-undefined-behavior-and-unsafe-rust-exercises",
        title: "Chapter 08 Exercises",
        shortTitle: "Exercises",
        description:
          "Audit unsafe abstractions, identify UB risks in raw-pointer code, repair MaybeUninit misuse, and design safe wrappers around unsafe boundaries",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch09-smart-pointers-and-pinning",
    title: "Chapter 09 · Smart Pointers and Pinning",
    icon: "book",
    pages: [
      {
        id: "ch09-smart-pointers-and-pinning",
        title: "Smart Pointers and Pinning",
        shortTitle: "Smart Pointers and Pinning",
        description:
          "Box, Rc, Arc, Cell, RefCell, Mutex, Weak, Pin, and the ownership tradeoffs behind them",
        icon: "book",
        codeKeys: ["smart_pointers_tree", "smart_pointers_pin_poll"],
      },
      {
        id: "ch09-smart-pointers-and-pinning-exercises",
        title: "Chapter 09 Exercises",
        shortTitle: "Exercises",
        description:
          "Choose pointer types deliberately, break cycles with Weak, and explain why pinned futures exist",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch10-arrays-slices-and-vectors",
    title: "Chapter 10 · Arrays, Slices, and Vectors",
    icon: "book",
    pages: [
      {
        id: "ch10-arrays-slices-and-vectors",
        title: "Arrays, Slices, and Vectors",
        shortTitle: "Arrays, Slices, and Vectors",
        description:
          "Fixed-size arrays, slice-first APIs, Vec<T> internals, capacity planning, mutation patterns, and contiguous-storage tradeoffs",
        icon: "book",
        codeKeys: ["arrays_slices_vectors_slice_api", "arrays_slices_vectors_capacity"],
      },
      {
        id: "ch10-arrays-slices-and-vectors-exercises",
        title: "Chapter 10 Exercises",
        shortTitle: "Exercises",
        description:
          "Practice slice-first APIs, preallocation decisions, and choosing array, slice, Vec, or inline-first storage under production constraints",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch11-hash-maps-and-sets",
    title: "Chapter 11 · Hash Maps and Sets",
    icon: "book",
    pages: [
      {
        id: "ch11-hash-maps-and-sets",
        title: "Hash Maps and Sets",
        shortTitle: "Hash Maps and Sets",
        description:
          "HashMap and HashSet fundamentals, borrowed lookups, Entry API, BTreeMap tradeoffs, stable ordering, and hasher choices",
        icon: "book",
        codeKeys: ["hash_maps_sets_entry_api", "hash_maps_sets_borrowed_lookup_ordered"],
      },
      {
        id: "ch11-hash-maps-and-sets-exercises",
        title: "Chapter 11 Exercises",
        shortTitle: "Exercises",
        description:
          "Use Entry API deliberately, implement borrowed lookups, and choose between HashMap, HashSet, and ordered tree variants",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch12-matrices-and-multidimensional-data",
    title: "Chapter 12 · Matrices and Multidimensional Data",
    icon: "book",
    pages: [
      {
        id: "ch12-matrices-and-multidimensional-data",
        title: "Matrices and Multidimensional Data",
        shortTitle: "Matrices and Multidimensional Data",
        description:
          "Dense flat storage, row-major vs column-major layout, views, const generics, sparse formats, and HPC interop boundaries",
        icon: "book",
        codeKeys: ["matrices_row_major_dense", "matrices_views_const_generics"],
      },
      {
        id: "ch12-matrices-and-multidimensional-data-exercises",
        title: "Chapter 12 Exercises",
        shortTitle: "Exercises",
        description:
          "Implement a row-major matrix wrapper, replace nested vectors, design no-copy views, and choose dense or sparse layouts deliberately",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch13-arena-allocation",
    title: "Chapter 13 · Arena Allocation and Region-Based Memory",
    icon: "book",
    pages: [
      {
        id: "ch13-arena-allocation",
        title: "Arena Allocation and Region-Based Memory",
        shortTitle: "Arena Allocation",
        description:
          "Bump allocators, arena-backed ASTs, region lifetimes, generational handles, slabs, and locality tradeoffs",
        icon: "book",
        codeKeys: ["arena_allocation_bump_scratch", "arena_allocation_index_ast"],
      },
      {
        id: "ch13-arena-allocation-exercises",
        title: "Chapter 13 Exercises",
        shortTitle: "Exercises",
        description:
          "Build a tiny arena-backed AST, compare Rc graphs with arena handles, and reason about lifetime-grouped memory",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch14-interfaces-in-rust-traits",
    title: "Chapter 14 · Interfaces in Rust: Traits",
    icon: "book",
    pages: [
      {
        id: "ch14-interfaces-in-rust-traits",
        title: "Interfaces in Rust: Traits",
        shortTitle: "Traits",
        description:
          "Traits as Rust's interface system, trait bounds, associated types, dyn Trait, dispatch choices, and object safety",
        icon: "book",
        codeKeys: ["traits_bounds_associated_types", "traits_dyn_plugin_pipeline"],
      },
      {
        id: "ch14-interfaces-in-rust-traits-exercises",
        title: "Chapter 14 Exercises",
        shortTitle: "Exercises",
        description:
          "Translate familiar interfaces into traits, choose static or dynamic dispatch, and repair object-safety mistakes",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch15-oop-models-in-rust",
    title: "Chapter 15 · OOP Models in Rust",
    icon: "book",
    pages: [
      {
        id: "ch15-oop-models-in-rust",
        title: "OOP Models in Rust",
        shortTitle: "OOP Models",
        description:
          "Composition over inheritance, traits and dyn Trait, enums, state patterns, visitors, and Rust-native encapsulation",
        icon: "book",
        codeKeys: ["oop_models_composition_traits", "oop_models_enum_state_machine"],
      },
      {
        id: "ch15-oop-models-in-rust-exercises",
        title: "Chapter 15 Exercises",
        shortTitle: "Exercises",
        description:
          "Replace inheritance with composition, choose enum or trait-based polymorphism, and refactor state machines into Rust-native designs",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch16-domain-driven-design-in-rust",
    title: "Chapter 16 · Domain-Driven Design in Rust",
    icon: "book",
    pages: [
      {
        id: "ch16-domain-driven-design-in-rust",
        title: "Domain-Driven Design in Rust",
        shortTitle: "DDD in Rust",
        description:
          "Entities, value objects, aggregates, repositories, invariants, event sourcing, and DDD boundaries",
        icon: "book",
        codeKeys: ["ddd_order_aggregate", "ddd_event_sourced_account"],
      },
      {
        id: "ch16-domain-driven-design-in-rust-exercises",
        title: "Chapter 16 Exercises",
        shortTitle: "Exercises",
        description:
          "Implement newtypes, encode aggregate invariants, and design repository seams for sync and async workloads",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch17-refactoring-toward-idiomatic-rust",
    title: "Chapter 17 · Refactoring Toward Idiomatic Rust",
    icon: "book",
    pages: [
      {
        id: "ch17-refactoring-toward-idiomatic-rust",
        title: "Refactoring Toward Idiomatic Rust",
        shortTitle: "Idiomatic Refactoring",
        description:
          "Refactor C++-style, C#-style, and Go-style Rust into clearer ownership, errors, traits, enums, async seams, and testable APIs",
        icon: "book",
        codeKeys: ["refactoring_result_owned_api", "refactoring_traits_enums_testable"],
      },
      {
        id: "ch17-refactoring-toward-idiomatic-rust-exercises",
        title: "Chapter 17 Exercises",
        shortTitle: "Exercises",
        description:
          "Refactor panic-based code into Result-based code, reduce lifetime noise, remove unnecessary clones, and improve test seams",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch18-generics-instead-of-templates",
    title: "Chapter 18 · Generics Instead of Templates",
    icon: "book",
    pages: [
      {
        id: "ch18-generics-instead-of-templates",
        title: "Generics Instead of Templates",
        shortTitle: "Generics",
        description:
          "Rust generics vs templates, monomorphization, trait bounds, where clauses, associated types, const generics, and performance tradeoffs",
        icon: "book",
        codeKeys: ["generics_batch_bounds", "generics_associated_types_const"],
      },
      {
        id: "ch18-generics-instead-of-templates-exercises",
        title: "Chapter 18 Exercises",
        shortTitle: "Exercises",
        description:
          "Translate template-style helpers into Rust generics, simplify traits with associated types, and implement const-generic fixed-size types",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch19-serialization-and-data-contracts",
    title: "Chapter 19 · Serialization and Data Contracts",
    icon: "book",
    pages: [
      {
        id: "ch19-serialization-and-data-contracts",
        title: "Serialization and Data Contracts",
        shortTitle: "Serialization",
        description:
          "Serde fundamentals, wire formats, schema evolution, custom serializers, zero-copy deserialization, and boundary contracts for distributed systems, WASM, and FFI",
        icon: "book",
        codeKeys: ["serialization_contracts_versioned_event", "serialization_contracts_custom_zero_copy"],
      },
      {
        id: "ch19-serialization-and-data-contracts-exercises",
        title: "Chapter 19 Exercises",
        shortTitle: "Exercises",
        description:
          "Round-trip versioned events, add custom serializers, design zero-copy boundaries, and choose format strategies deliberately",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch20-metaprogramming",
    title: "Chapter 20 · Metaprogramming",
    icon: "book",
    pages: [
      {
        id: "ch20-metaprogramming",
        title: "Metaprogramming",
        shortTitle: "Metaprogramming",
        description:
          "Declarative and procedural macros, token streams, compile-time DSLs, code generation strategies, and when not to use macros",
        icon: "book",
        codeKeys: ["metaprogramming_macro_rules_hygiene", "metaprogramming_compile_time_dsl"],
      },
      {
        id: "ch20-metaprogramming-exercises",
        title: "Chapter 20 Exercises",
        shortTitle: "Exercises",
        description:
          "Choose the right metaprogramming tool, write a small macro_rules helper, and sketch derive and attribute macro APIs",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch21-reflection-and-type-introspection",
    title: "Chapter 21 · Reflection and Type Introspection",
    icon: "book",
    pages: [
      {
        id: "ch21-reflection-and-type-introspection",
        title: "Reflection and Type Introspection",
        shortTitle: "Reflection",
        description:
          "Why Rust limits runtime reflection, Any and TypeId, downcasting, macro-based introspection, schema generation, and explicit metadata systems",
        icon: "book",
        codeKeys: ["reflection_any_typeid_registry", "reflection_plugin_metadata_downcast"],
      },
      {
        id: "ch21-reflection-and-type-introspection-exercises",
        title: "Chapter 21 Exercises",
        shortTitle: "Exercises",
        description:
          "Build a small TypeId registry, downcast safely from erased values, and design explicit metadata for plugin boundaries",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch22-multithreading-in-rust",
    title: "Chapter 22 · Multithreading in Rust",
    icon: "book",
    pages: [
      {
        id: "ch22-multithreading-in-rust",
        title: "Multithreading in Rust",
        shortTitle: "Multithreading",
        description:
          "Rust's thread safety model, Send and Sync, spawning and scoped threads, shared state, channels, work stealing, and cross-language tradeoffs",
        icon: "book",
        codeKeys: [
          "multithreading_owned_jobs_channel",
          "multithreading_shared_state_metrics",
          "multithreading_scoped_threads_sum",
        ],
      },
      {
        id: "ch22-multithreading-in-rust-exercises",
        title: "Chapter 22 Exercises",
        shortTitle: "Exercises",
        description:
          "Classify Send and Sync, move owned data into worker threads, and compare channel-based and shared-state designs",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch23-synchronization-primitives",
    title: "Chapter 23 · Synchronization Primitives",
    icon: "book",
    pages: [
      {
        id: "ch23-synchronization-primitives",
        title: "Synchronization Primitives",
        shortTitle: "Synchronization",
        description:
          "Mutex, RwLock, Condvar, atomics, memory ordering, barriers, channels, lock-free patterns, deadlock prevention, and choosing the right primitive",
        icon: "book",
        codeKeys: [
          "synchronization_mutex_condvar_queue",
          "synchronization_rwlock_barrier",
          "synchronization_atomics_ordering",
        ],
      },
      {
        id: "ch23-synchronization-primitives-exercises",
        title: "Chapter 23 Exercises",
        shortTitle: "Exercises",
        description:
          "Replace a Mutex with RwLock where appropriate, reason about Acquire and Release ordering, and repair deadlock-prone designs",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch24-coroutines-futures-and-async-rust",
    title: "Chapter 24 · Coroutines, Futures, and Async Rust",
    icon: "book",
    pages: [
      {
        id: "ch24-coroutines-futures-and-async-rust",
        title: "Coroutines, Futures, and Async Rust",
        shortTitle: "Async Rust",
        description:
          "Coroutines vs futures, async fn and await, compiler-generated state machines, Pin, executors, cancellation, structured concurrency, async traits, and lifetime pitfalls",
        icon: "book",
        codeKeys: [
          "async_rust_async_fn_await_block_on",
          "async_rust_manual_future_state_machine",
        ],
      },
      {
        id: "ch24-coroutines-futures-and-async-rust-exercises",
        title: "Chapter 24 Exercises",
        shortTitle: "Exercises",
        description:
          "Trace async state machines, repair Send-bound spawn problems, and model cancellation and cleanup explicitly",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch25-tokio",
    title: "Chapter 25 · Tokio",
    icon: "book",
    pages: [
      {
        id: "ch25-tokio",
        title: "Tokio",
        shortTitle: "Tokio",
        description:
          "Runtime architecture, tasks and scheduling, spawn vs spawn_blocking, timers, async TCP and UDP, async fs, channels, graceful shutdown, backpressure, and production Tokio patterns",
        icon: "book",
        codeKeys: ["tokio_tasks_backpressure_spawn_blocking", "tokio_tcp_graceful_shutdown"],
      },
      {
        id: "ch25-tokio-exercises",
        title: "Chapter 25 Exercises",
        shortTitle: "Exercises",
        description: "Build a small Tokio TCP service, add graceful shutdown, and move blocking CPU work behind spawn_blocking",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch26-task-libraries-and-parallel-execution",
    title: "Chapter 26 · Task Libraries and Parallel Execution",
    icon: "book",
    pages: [
      {
        id: "ch26-task-libraries-and-parallel-execution",
        title: "Task Libraries and Parallel Execution",
        shortTitle: "Task Libraries",
        description:
          "Tokio tasks, Rayon, Crossbeam, futures orchestration, CPU vs IO workloads, thread pools, backpressure, cancellation, retry, and task API design",
        icon: "book",
        codeKeys: ["task_libraries_tokio_orchestration", "task_libraries_rayon_crossbeam"],
      },
      {
        id: "ch26-task-libraries-and-parallel-execution-exercises",
        title: "Chapter 26 Exercises",
        shortTitle: "Exercises",
        description:
          "Choose Tokio, Rayon, Crossbeam, or futures utilities; implement a bounded worker queue; and add cancellation and retry policy to task orchestration",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch27-io-tricks-and-systems-programming-patterns",
    title: "Chapter 27 · IO Tricks and Systems Programming Patterns",
    icon: "book",
    pages: [
      {
        id: "ch27-io-tricks-and-systems-programming-patterns",
        title: "IO Tricks and Systems Programming Patterns",
        shortTitle: "IO Tricks",
        description:
          "Buffered IO, zero-copy concepts, memory-mapped files, scatter/gather IO, blocking vs async IO, descriptor ownership, socket tuning, backpressure, and IO profiling",
        icon: "book",
        codeKeys: ["io_patterns_buffered_backpressure", "io_patterns_scatter_gather_socket"],
      },
      {
        id: "ch27-io-tricks-and-systems-programming-patterns-exercises",
        title: "Chapter 27 Exercises",
        shortTitle: "Exercises",
        description:
          "Compare buffered and unbuffered reads, design a backpressure-aware IO pipeline, and reason clearly about descriptor ownership",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch28-cpp-integration",
    title: "Chapter 28 · C++ Integration",
    icon: "book",
    pages: [
      {
        id: "ch28-cpp-integration",
        title: "C++ Integration",
        shortTitle: "C++ Integration",
        description:
          "Rust FFI fundamentals, C ABI seams, ownership, status-code error handling, unwind policy, and interop testing",
        icon: "book",
        codeKeys: ["cpp_integration_calling_c_abi", "cpp_integration_export_rust_c_abi"],
      },
      {
        id: "ch28-cpp-integration-exercises",
        title: "Chapter 28 Exercises",
        shortTitle: "Exercises",
        description:
          "Flatten Rust types into a C ABI-safe surface, map ownership across the seam, and choose an interop strategy deliberately",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch29-js-and-cpp-integration-for-wasm",
    title: "Chapter 29 · JavaScript and C++ Integration for WASM",
    icon: "book",
    pages: [
      {
        id: "ch29-js-and-cpp-integration-for-wasm",
        title: "JavaScript and C++ Integration for WASM",
        shortTitle: "WASM Interop",
        description:
          "Rust to WebAssembly, wasm-bindgen, JS interop, boundary data choices, C++ shims, WASI, performance limits, serialization, and debugging",
        icon: "book",
        codeKeys: ["wasm_bindgen_string_array_boundary", "wasm_cpp_ffi_boundary"],
      },
      {
        id: "ch29-js-and-cpp-integration-for-wasm-exercises",
        title: "Chapter 29 Exercises",
        shortTitle: "Exercises",
        description:
          "Export Rust to JavaScript with wasm-bindgen, choose serialization and memory boundaries, and reason about JS/WASM copying costs",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch30-amqp-and-message-brokers",
    title: "Chapter 30 · AMQP and Message Brokers",
    icon: "book",
    pages: [
      {
        id: "ch30-amqp-and-message-brokers",
        title: "AMQP and Message Brokers",
        shortTitle: "AMQP and Brokers",
        description:
          "Broker fundamentals, AMQP exchanges and queues, RabbitMQ with Rust, acknowledgments, retries, dead-letter queues, idempotency, backpressure, serialization, and observability",
        icon: "book",
        codeKeys: ["amqp_direct_exchange_routing", "amqp_idempotent_consumer"],
      },
      {
        id: "ch30-amqp-and-message-brokers-exercises",
        title: "Chapter 30 Exercises",
        shortTitle: "Exercises",
        description:
          "Model an idempotent consumer, add retry and dead-letter handling, and design versioned message contracts",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch31-distributed-task-execution",
    title: "Chapter 31 · Distributed Task Execution",
    icon: "book",
    pages: [
      {
        id: "ch31-distributed-task-execution",
        title: "Distributed Task Execution",
        shortTitle: "Distributed Tasks",
        description:
          "Task queues, work distribution models, delivery semantics, leasing, retries, failure isolation, result aggregation, task graphs, tracing, and profiling for distributed workloads",
        icon: "book",
        codeKeys: ["distributed_tasks_lease_idempotent", "distributed_tasks_graph_trace"],
      },
      {
        id: "ch31-distributed-task-execution-exercises",
        title: "Chapter 31 Exercises",
        shortTitle: "Exercises",
        description:
          "Design a lease-based distributed worker, model at-least-once execution with idempotency, and trace distributed task graphs end to end",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch32-mpi-and-high-performance-computing",
    title: "Chapter 32 · MPI and High-Performance Computing",
    icon: "book",
    pages: [
      {
        id: "ch32-mpi-and-high-performance-computing",
        title: "MPI and High-Performance Computing",
        shortTitle: "MPI and HPC",
        description:
          "MPI process model, collectives, data layout, Rust MPI crates, hybrid MPI plus threads, profiling, and HPC production environments",
        icon: "book",
        codeKeys: ["mpi_partition_dense_rows", "mpi_collective_counts_and_allreduce"],
      },
      {
        id: "ch32-mpi-and-high-performance-computing-exercises",
        title: "Chapter 32 Exercises",
        shortTitle: "Exercises",
        description:
          "Partition matrix rows across ranks, choose collective-friendly layouts, and reason about hybrid MPI plus threads and communication profiling",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch33-performance-oriented-rust",
    title: "Chapter 33 · Performance-Oriented Rust",
    icon: "book",
    pages: [
      {
        id: "ch33-performance-oriented-rust",
        title: "Performance-Oriented Rust",
        shortTitle: "Performance",
        description:
          "Rust's performance model, allocation awareness, cache locality, branch prediction, static dispatch, iterator tradeoffs, benchmarking methodology, and release profile choices",
        icon: "book",
        codeKeys: ["performance_allocation_borrowed_filter", "performance_row_major_scan"],
      },
      {
        id: "ch33-performance-oriented-rust-exercises",
        title: "Chapter 33 Exercises",
        shortTitle: "Exercises",
        description:
          "Write a benchmark plan, refactor for locality, compare loops and iterators responsibly, and make measurement discipline explicit",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch34-memory-profiling",
    title: "Chapter 34 · Memory Profiling",
    icon: "book",
    pages: [
      {
        id: "ch34-memory-profiling",
        title: "Memory Profiling",
        shortTitle: "Memory Profiling",
        description:
          "Measuring allocations, heap profiling, clone pressure, cycle leaks, fragmentation, arena retention, async memory usage, allocator behavior, and footprint reduction",
        icon: "book",
        codeKeys: ["memory_profiling_clone_pressure_counter", "memory_profiling_rc_cycle_leak"],
      },
      {
        id: "ch34-memory-profiling-exercises",
        title: "Chapter 34 Exercises",
        shortTitle: "Exercises",
        description:
          "Find clone pressure, diagnose Rc and Arc leaks, choose profiling tools, and build a memory profiling checklist",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch35-performance-profiling",
    title: "Chapter 35 · Performance Profiling",
    icon: "book",
    pages: [
      {
        id: "ch35-performance-profiling",
        title: "Performance Profiling",
        shortTitle: "Performance Profiling",
        description:
          "CPU profiling, flame graphs, sampling vs instrumentation, Criterion benchmarks, async and lock profiling, serialization and IO analysis, and WASM and FFI profiling boundaries",
        icon: "book",
        codeKeys: ["performance_profiling_hot_stage_summary", "performance_profiling_pipeline_bottleneck"],
      },
      {
        id: "ch35-performance-profiling-exercises",
        title: "Chapter 35 Exercises",
        shortTitle: "Exercises",
        description:
          "Interpret flame graphs, design Criterion benchmarks, separate CPU and waiting bottlenecks, and profile async, WASM, and FFI boundaries deliberately",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch36-distributed-tasks-profiling",
    title: "Chapter 36 · Distributed Tasks Profiling",
    icon: "book",
    pages: [
      {
        id: "ch36-distributed-tasks-profiling",
        title: "Distributed Tasks Profiling",
        shortTitle: "Task Profiling",
        description:
          "End-to-end latency, queue latency, worker saturation, retry storms, tail latency, distributed tracing, metrics design, task-graph profiling, and capacity planning",
        icon: "book",
        codeKeys: [
          "distributed_profiling_latency_window",
          "distributed_profiling_task_graph",
        ],
      },
      {
        id: "ch36-distributed-tasks-profiling-exercises",
        title: "Chapter 36 Exercises",
        shortTitle: "Exercises",
        description:
          "Design saturation metrics, trace tail-latency incidents, identify retry storms, and capacity-plan distributed workers",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch37-cuda-and-gpu-acceleration",
    title: "Chapter 37 · CUDA and GPU Acceleration",
    icon: "book",
    pages: [
      {
        id: "ch37-cuda-and-gpu-acceleration",
        title: "CUDA and GPU Acceleration",
        shortTitle: "CUDA and GPU",
        description:
          "When GPU acceleration pays, safe launch wrappers, device-memory ownership, transfer and launch overhead, profiling, and async or distributed integration",
        icon: "book",
        codeKeys: ["cuda_gpu_kernel_launch_wrapper", "cuda_gpu_transfer_budget"],
      },
      {
        id: "ch37-cuda-and-gpu-acceleration-exercises",
        title: "Chapter 37 Exercises",
        shortTitle: "Exercises",
        description:
          "Estimate transfer cost, sketch a safe kernel wrapper, and choose CPU, Rayon, MPI, or CUDA from workload shape",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch38-merkle-tree-games-and-challenges",
    title: "Chapter 38 · Merkle Tree Games and Challenges",
    icon: "book",
    pages: [
      {
        id: "ch38-merkle-tree-games-and-challenges",
        title: "Merkle Tree Games and Challenges",
        shortTitle: "Merkle Trees",
        description:
          "Hash trees, ownership-aware construction, inclusion proofs, persistent variants, parallel construction, serialization, and production challenges around content-addressed storage and distributed verification",
        icon: "book",
        codeKeys: ["merkle_tree_basic_proof", "merkle_parallel_levels"],
      },
      {
        id: "ch38-merkle-tree-games-and-challenges-exercises",
        title: "Chapter 38 Exercises",
        shortTitle: "Exercises",
        description:
          "Implement a Merkle tree API, verify inclusion proofs, and design parallel, tamper-evident, and distributed verification systems",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch39-graph-search-games",
    title: "Chapter 39 · Graph Search Games",
    icon: "book",
    pages: [
      {
        id: "ch39-graph-search-games",
        title: "Graph Search Games",
        shortTitle: "Graph Search Games",
        description:
          "Graph representations in Rust, BFS and DFS, Dijkstra and A*, ownership-friendly graph models, arena-backed graphs, parallel traversal, and challenge tracks for mazes, dependency resolution, and distributed search",
        icon: "book",
        codeKeys: ["graph_search_bfs_handles", "graph_search_dijkstra_astar"],
      },
      {
        id: "ch39-graph-search-games-exercises",
        title: "Chapter 39 Exercises",
        shortTitle: "Exercises",
        description:
          "Implement BFS with stable indices, compare graph representations, and design maze, dependency, and distributed graph-search challenges",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch40-matrix-optimization-games",
    title: "Chapter 40 · Matrix Optimization Games",
    icon: "book",
    pages: [
      {
        id: "ch40-matrix-optimization-games",
        title: "Matrix Optimization Games",
        shortTitle: "Matrix Games",
        description:
          "Matrix storage layouts, cache-aware multiplication, SIMD opportunities, sparse vs dense tradeoffs, blocking and tiling, parallel matrix operations, GPU offload, and optimization challenge tracks",
        icon: "book",
        codeKeys: ["matrix_games_tiled_matmul", "matrix_games_sparse_frontier"],
      },
      {
        id: "ch40-matrix-optimization-games-exercises",
        title: "Chapter 40 Exercises",
        shortTitle: "Exercises",
        description:
          "Implement naive and tiled multiplication variants, choose sparse or dense representations, and design a fair CPU vs GPU benchmark tournament",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch41-error-handling-in-large-systems",
    title: "Chapter 41 · Error Handling in Large Systems",
    icon: "book",
    pages: [
      {
        id: "ch41-error-handling-in-large-systems",
        title: "Error Handling in Large Systems",
        shortTitle: "Error Handling",
        description:
          "Result and Option, typed error enums, thiserror and anyhow, context propagation, async and FFI boundaries, logging discipline, and error-contract design for production systems",
        icon: "book",
        codeKeys: ["error_handling_typed_contracts", "error_handling_async_context"],
      },
      {
        id: "ch41-error-handling-in-large-systems-exercises",
        title: "Chapter 41 Exercises",
        shortTitle: "Exercises",
        description:
          "Convert panic-based logic into typed errors, separate domain and infrastructure failures, and add context to async propagation",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch42-testing-advanced-rust-systems",
    title: "Chapter 42 · Testing Advanced Rust Systems",
    icon: "book",
    pages: [
      {
        id: "ch42-testing-advanced-rust-systems",
        title: "Testing Advanced Rust Systems",
        shortTitle: "Advanced Testing",
        description:
          "Unit tests, integration tests, property testing, fuzzing, unsafe and async testing, distributed-system harnesses, golden files, snapshot testing, and benchmark regression budgets",
        icon: "book",
        codeKeys: ["testing_property_invariant_harness", "testing_async_idempotent_delivery_harness"],
      },
      {
        id: "ch42-testing-advanced-rust-systems-exercises",
        title: "Chapter 42 Exercises",
        shortTitle: "Exercises",
        description:
          "Choose the right test layer, design property and fuzz strategies, build async integration plans, and create a production-grade testing matrix",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch43-observability",
    title: "Chapter 43 · Observability",
    icon: "book",
    pages: [
      {
        id: "ch43-observability",
        title: "Observability",
        shortTitle: "Observability",
        description:
          "Logging, metrics, tracing, structured logs, OpenTelemetry, async and distributed tracing, profiling in production, alerting, SLOs, and observability-driven refactoring",
        icon: "book",
        codeKeys: ["observability_tracing_tokio_spans", "observability_metrics_slo_window"],
      },
      {
        id: "ch43-observability-exercises",
        title: "Chapter 43 Exercises",
        shortTitle: "Exercises",
        description:
          "Instrument Tokio work with spans, design backpressure and latency metrics, and connect logs, metrics, and traces in incident narratives",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch44-packaging-and-deployment",
    title: "Chapter 44 · Packaging and Deployment",
    icon: "book",
    pages: [
      {
        id: "ch44-packaging-and-deployment",
        title: "Packaging and Deployment",
        shortTitle: "Packaging and Deployment",
        description:
          "Static binaries, cross-compilation, Docker images, minimal runtime containers, wasm and native-library packaging, CI/CD, supply-chain security, feature-gated builds, and release engineering",
        icon: "book",
        codeKeys: ["packaging_target_matrix", "packaging_release_bundle"],
      },
      {
        id: "ch44-packaging-and-deployment-exercises",
        title: "Chapter 44 Exercises",
        shortTitle: "Exercises",
        description:
          "Build a packaging matrix, design a feature-gated release workflow, add supply-chain checks to CI, and write a production-ready release plan",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch45-capstone-distributed-rust-system",
    title: "Chapter 45 · Capstone: A Distributed Rust System",
    icon: "book",
    pages: [
      {
        id: "ch45-capstone-distributed-rust-system",
        title: "Capstone: A Distributed Rust System",
        shortTitle: "Capstone",
        description:
          "Compose an end-to-end distributed Rust system: typed task envelopes, brokered work, replay-safe completion, Merkle verification, specialized graph and matrix lanes, optional acceleration, and rollout discipline",
        icon: "book",
        codeKeys: ["capstone_task_envelope_routing", "capstone_worker_pool_workloads"],
      },
      {
        id: "ch45-capstone-distributed-rust-system-exercises",
        title: "Chapter 45 Exercises",
        shortTitle: "Exercises",
        description: "Review the capstone like a staff engineer: architecture, milestones, queue budgets, replay safety, profiling evidence, and rollout gates",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch46-fastapi-style-web-apps-swagger-openapi-codegen",
    title: "Chapter 46 · FastAPI-Style Web Apps, Swagger, and OpenAPI Codegen",
    icon: "book",
    pages: [
      {
        id: "ch46-fastapi-style-web-apps-swagger-openapi-codegen",
        title: "FastAPI-Style Web Apps, Swagger, and OpenAPI Codegen",
        shortTitle: "Web APIs and OpenAPI",
        description:
          "Design typed Rust web APIs with extractors, state, OpenAPI and Swagger workflows, generated clients, auth, idempotency, and graceful shutdown—without leaking HTTP into the domain",
        icon: "book",
        codeKeys: ["fastapi_style_handler_service_boundary", "fastapi_style_openapi_codegen_scaffold"],
      },
      {
        id: "ch46-fastapi-style-web-apps-swagger-openapi-codegen-exercises",
        title: "Chapter 46 Exercises",
        shortTitle: "Exercises",
        description:
          "Translate FastAPI-style ergonomics into Rust seams, choose an OpenAPI workflow, and prevent documentation or codegen drift",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch47-grpc-services-with-protobuf-and-service-api-codegen",
    title: "Chapter 47 · gRPC Services with Protobuf and Service API Codegen",
    icon: "book",
    pages: [
      {
        id: "ch47-grpc-services-with-protobuf-and-service-api-codegen",
        title: "gRPC Services with Protobuf and Service API Codegen",
        shortTitle: "gRPC and Protobuf",
        description:
          "Treat protobuf as the contract: unary and streaming gRPC shapes, generated code, transport-to-domain mapping, deadlines, retries, metadata, and polyglot compatibility",
        icon: "book",
        codeKeys: ["grpc_transport_to_domain_mapping", "grpc_status_deadline_retry"],
      },
      {
        id: "ch47-grpc-services-with-protobuf-and-service-api-codegen-exercises",
        title: "Chapter 47 Exercises",
        shortTitle: "Exercises",
        description:
          "Choose the right RPC shape, contain generated types to the edge, and test schema evolution, deadlines, and streaming backpressure",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch48-websockets-long-lived-connections",
    title: "Chapter 48 · WebSockets and Long-Lived Connections",
    icon: "book",
    pages: [
      {
        id: "ch48-websockets-long-lived-connections",
        title: "WebSockets and Long-Lived Connections",
        shortTitle: "WebSockets",
        description:
          "Model long-lived connection systems with explicit read/write ownership, bounded fan-out, versioned envelopes, reconnect policy, and graceful shutdown",
        icon: "book",
        codeKeys: ["websocket_connection_io_split", "websocket_bounded_fanout_slow_consumers"],
      },
      {
        id: "ch48-websockets-long-lived-connections-exercises",
        title: "Chapter 48 Exercises",
        shortTitle: "Exercises",
        description:
          "Select the right live transport, bound slow consumers, design reconnect semantics, and test connection storms and drains",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch49-https-tls-secure-service-boundaries",
    title: "Chapter 49 · HTTPS, TLS, and Secure Service Boundaries",
    icon: "book",
    pages: [
      {
        id: "ch49-https-tls-secure-service-boundaries",
        title: "HTTPS, TLS, and Secure Service Boundaries",
        shortTitle: "HTTPS and TLS",
        description:
          "Engineer secure service edges: TLS termination, rustls vs platform TLS, mTLS, certificate rotation, hardened cookies/CORS/HSTS, and safe debugging",
        icon: "book",
        codeKeys: ["https_tls_topology_policy", "https_tls_security_defaults"],
      },
      {
        id: "ch49-https-tls-secure-service-boundaries-exercises",
        title: "Chapter 49 Exercises",
        shortTitle: "Exercises",
        description:
          "Choose TLS ownership, harden edge defaults, design cert rotation and mTLS, and debug trust failures without weakening verification",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch50-libp2p-peer-to-peer-rust-systems",
    title: "Chapter 50 · libp2p and Peer-to-Peer Rust Systems",
    icon: "book",
    pages: [
      {
        id: "ch50-libp2p-peer-to-peer-rust-systems",
        title: "libp2p and Peer-to-Peer Rust Systems",
        shortTitle: "libp2p and P2P",
        description:
          "Compose peer identity, discovery, request-response/pub-sub, relay policy, sync, and observability into a reviewable Rust P2P architecture",
        icon: "book",
        codeKeys: ["libp2p_swarm_state_machine", "libp2p_state_sync_conflicts"],
      },
      {
        id: "ch50-libp2p-peer-to-peer-rust-systems-exercises",
        title: "Chapter 50 Exercises",
        shortTitle: "Exercises",
        description:
          "Model swarm loops, bound discovery, plan NAT/relay fallback, and decide when P2P beats brokers or service APIs",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch51-zero-knowledge-proofs-rust-engineers",
    title: "Chapter 51 · Zero-Knowledge Proofs for Rust Engineers",
    icon: "book",
    pages: [
      {
        id: "ch51-zero-knowledge-proofs-rust-engineers",
        title: "Zero-Knowledge Proofs for Rust Engineers",
        shortTitle: "Zero-Knowledge Proofs",
        description:
          "Separate statements, witnesses, constraints, transcripts, keys, proofs, and service boundaries so ZK systems stay reviewable in Rust",
        icon: "book",
        codeKeys: ["zkp_statement_witness_proof", "zkp_transcript_domain_separation"],
      },
      {
        id: "ch51-zero-knowledge-proofs-rust-engineers-exercises",
        title: "Chapter 51 Exercises",
        shortTitle: "Exercises",
        description:
          "Keep public and private material distinct, isolate proving from verification, and threat-model proof-backed APIs",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch52-zokrates-workflows-ethereum-verifiers",
    title: "Chapter 52 · ZoKrates Workflows and Ethereum Verifiers",
    icon: "book",
    pages: [
      {
        id: "ch52-zokrates-workflows-ethereum-verifiers",
        title: "ZoKrates Workflows and Ethereum Verifiers",
        shortTitle: "ZoKrates and Ethereum",
        description:
          "Run ZoKrates like a toolchain: compile/setup/witness/proof/export/verify stages, artifact custody, Ethereum verifier integration, and upgrade discipline",
        icon: "book",
        codeKeys: ["zokrates_workflow_command_plan", "zokrates_ethereum_verifier_boundary"],
      },
      {
        id: "ch52-zokrates-workflows-ethereum-verifiers-exercises",
        title: "Chapter 52 Exercises",
        shortTitle: "Exercises",
        description:
          "Split build/release/runtime responsibilities, version artifacts, keep verifier requests witness-free, and plan audits and rollouts",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch53-ezkl-verifiable-llm-inference-gpu-zkml",
    title: "Chapter 53 · EZKL, Verifiable LLM Inference, and GPU-Aware ZKML",
    icon: "book",
    pages: [
      {
        id: "ch53-ezkl-verifiable-llm-inference-gpu-zkml",
        title: "EZKL, Verifiable LLM Inference, and GPU-Aware ZKML",
        shortTitle: "EZKL and ZKML",
        description:
          "Productize verifiable inference with explicit model artifacts, tokenization and quantization policy, bounded proving lanes, GPU-aware profiling, and verifier-safe APIs",
        icon: "book",
        codeKeys: ["zkml_verification_boundary_types", "zkml_proving_queue_profile"],
      },
      {
        id: "ch53-ezkl-verifiable-llm-inference-gpu-zkml-exercises",
        title: "Chapter 53 Exercises",
        shortTitle: "Exercises",
        description:
          "Classify ZKML artifacts, separate proving from verification, profile bottlenecks honestly, and plan versioned rollout",
        icon: "trophy",
      },
    ],
  },
  {
    id: "ch54-no-std-rust-constrained-runtime-derivatives",
    title: "Chapter 54 · no-std Rust and Constrained Runtime Derivatives",
    icon: "book",
    pages: [
      {
        id: "ch54-no-std-rust-constrained-runtime-derivatives",
        title: "no-std Rust and Constrained Runtime Derivatives",
        shortTitle: "no_std Rust",
        description:
          "Design portable Rust surfaces across core, alloc, and std: fixed-capacity memory, DMA/MMIO ownership, embedded layering, and host-testable no_std crates",
        icon: "book",
        codeKeys: ["no_std_portable_surface", "no_std_fixed_capacity_dma"],
      },
      {
        id: "ch54-no-std-rust-constrained-runtime-derivatives-exercises",
        title: "Chapter 54 Exercises",
        shortTitle: "Exercises",
        description:
          "Choose the right runtime surface, design fixed-capacity paths, audit constrained unsafe code, and keep portable logic testable from the host",
        icon: "trophy",
      },
    ],
  },
  {
    id: "appendices-and-integration",
    title: "Appendices · Reference and Integration",
    icon: "book",
    pages: [
      {
        id: "appendix-a-rust-syntax-for-cpp-developers",
        title: "Appendix A · Rust Syntax for C++ Developers",
        shortTitle: "Appendix A",
        description: "Quick translation guide for C++ engineers moving into Rust ownership, traits, generics, and error handling",
        icon: "book",
      },
      {
        id: "appendix-b-rust-syntax-for-csharp-developers",
        title: "Appendix B · Rust Syntax for C# Developers",
        shortTitle: "Appendix B",
        description: "Quick translation guide for C# engineers moving into Rust ownership, typed errors, and async boundaries",
        icon: "book",
      },
      {
        id: "appendix-c-rust-syntax-for-go-developers",
        title: "Appendix C · Rust Syntax for Go Developers",
        shortTitle: "Appendix C",
        description: "Quick translation guide for Go engineers moving into Rust ownership, traits, and transport boundaries",
        icon: "book",
      },
      { id: "appendix-d-ownership-error-cheat-sheet", title: "Appendix D · Ownership Error Cheat Sheet", shortTitle: "Appendix D", description: "Repair patterns for the most common ownership, borrowing, lifetime, and async boundary mistakes", icon: "book" },
      { id: "appendix-e-unsafe-rust-audit-checklist", title: "Appendix E · Unsafe Rust Audit Checklist", shortTitle: "Appendix E", description: "A compact review checklist for unsafe blocks, wrappers, FFI, MMIO, and allocator boundaries", icon: "book" },
      { id: "appendix-f-trait-object-and-generics-decision-guide", title: "Appendix F · Trait Object and Generics Decision Guide", shortTitle: "Appendix F", description: "When to stay concrete, use enums, use generics, or use dyn Trait from the real boundary", icon: "book" },
      { id: "appendix-g-async-rust-troubleshooting-guide", title: "Appendix G · Async Rust Troubleshooting Guide", shortTitle: "Appendix G", description: "A symptom-first reference for Send, cancellation, blocking, queue growth, and task-boundary bugs", icon: "book" },
      { id: "appendix-h-ffi-checklist", title: "Appendix H · FFI Checklist", shortTitle: "Appendix H", description: "ABI, ownership, panic, nullability, and test-lane checks for foreign boundaries", icon: "book" },
      { id: "appendix-i-performance-checklist", title: "Appendix I · Performance Checklist", shortTitle: "Appendix I", description: "A concise review checklist for measurement, layout, allocations, queueing, and validation", icon: "book" },
      { id: "appendix-j-recommended-crates-by-topic", title: "Appendix J · Recommended Crates by Topic", shortTitle: "Appendix J", description: "Common crate starting points to evaluate by topic and boundary shape", icon: "book" },
      { id: "appendix-k-glossary-of-rust-terms", title: "Appendix K · Glossary of Rust Terms", shortTitle: "Appendix K", description: "Compact glossary of Rust terms used repeatedly across the book", icon: "book" },
      { id: "appendix-l-suggested-reading-path-by-background", title: "Appendix L · Suggested Reading Path by Background", shortTitle: "Appendix L", description: "Recommended chapter routes for C++, C#, and Go backgrounds", icon: "book" },
      { id: "appendix-m-rust-web-services-and-api-contract-checklist", title: "Appendix M · Rust Web Services and API Contract Checklist", shortTitle: "Appendix M", description: "A compact contract and rollout checklist for Rust HTTP and gRPC service surfaces", icon: "book" },
      { id: "appendix-n-zkp-zokrates-and-zkml-production-caveats", title: "Appendix N · ZKP, ZoKrates, and ZKML Production Caveats", shortTitle: "Appendix N", description: "Operational caveats for proof-backed systems, generated verifiers, and verifiable ML pipelines", icon: "book" },
      { id: "appendix-o-no-std-rust-portability-and-audit-checklist", title: "Appendix O · no-std Rust Portability and Audit Checklist", shortTitle: "Appendix O", description: "A portability and audit checklist for core, alloc, std, and constrained-runtime Rust", icon: "book" },
      {
        id: "exercise-index",
        title: "Exercise Index",
        shortTitle: "Exercise Index",
        description: "Map every numbered chapter to its exercise page and primary skills for faster practice planning",
        icon: "trophy",
      },
    ],
  },
]

// Flatten pages for easy indexing
export const PAGES: PageConfig[] = CHAPTERS.flatMap(chapter => chapter.pages)

// Helper to get chapter index for a page index
export function getChapterForPage(pageIndex: number): { chapterIndex: number; pageInChapter: number } {
  let count = 0
  for (let i = 0; i < CHAPTERS.length; i++) {
    const chapter = CHAPTERS[i]
    if (pageIndex < count + chapter.pages.length) {
      return { chapterIndex: i, pageInChapter: pageIndex - count }
    }
    count += chapter.pages.length
  }
  return { chapterIndex: 0, pageInChapter: 0 }
}

// Helper to get page indices for a chapter
export function getPageIndicesForChapter(chapterIndex: number): number[] {
  let startIndex = 0
  for (let i = 0; i < chapterIndex; i++) {
    startIndex += CHAPTERS[i].pages.length
  }
  return CHAPTERS[chapterIndex].pages.map((_, i) => startIndex + i)
}

export const DEFAULT_CODES: Record<string, string> = {
  why_rust_pipeline: `fn critical_count(readings: &[i32], threshold: i32) -> usize {
    readings
        .iter()
        .copied()
        .filter(|reading| *reading >= threshold)
        .count()
}

fn main() {
    let readings = vec![42, 87, 91, 63, 99];
    let count = critical_count(&readings, 80);
    println!("critical count = {}", count);
}`,
  why_rust_thread_handoff: `use std::thread;

fn main() {
    let job = String::from("rebuild-search-index");

    let handle = thread::spawn(move || {
        println!("worker started: {}", job);
    });

    handle.join().unwrap();
}`,
  mental_model_move_drop: `struct FileHandle {
    name: String,
}

impl Drop for FileHandle {
    fn drop(&mut self) {
        println!("drop {}", self.name);
    }
}

fn ship(handle: FileHandle) {
    println!("shipping {}", handle.name);
}

fn main() {
    let handle = FileHandle {
        name: String::from("audit.log"),
    };

    println!("before move");
    ship(handle);
    println!("after ship");
}`,
  mental_model_blocks_heap: `fn main() {
    let queue_depth = 2048;

    let status = if queue_depth > 1024 { "hot" } else { "steady" };

    let labels = {
        let mut labels = Vec::with_capacity(8);
        labels.push(String::from("ingest"));
        labels.push(String::from("priority"));
        labels
    };

    let capacity = {
        let heap_slots = labels.capacity();
        heap_slots
    };

    println!("status = {}", status);
    println!("capacity = {}", capacity);
}`,
  project_structure_module_visibility: `mod config {
    pub struct AppConfig {
        pub service_name: String,
        bind_addr: String,
    }

    impl AppConfig {
        pub fn new(service_name: &str, bind_addr: &str) -> Self {
            Self {
                service_name: service_name.to_string(),
                bind_addr: bind_addr.to_string(),
            }
        }

        pub fn bind_addr(&self) -> &str {
            &self.bind_addr
        }
    }
}

fn main() {
    let config = config::AppConfig::new("api", "127.0.0.1:8080");
    println!("{}@{}", config.service_name, config.bind_addr());
}`,
  project_structure_feature_flags: `// In a real crate, a Cargo feature would usually select this at compile time.
const METRICS_ENABLED: bool = false;

fn metrics_backend() -> &'static str {
    if METRICS_ENABLED {
        "prometheus"
    } else {
        "disabled"
    }
}

fn main() {
    println!("metrics backend = {}", metrics_backend());
}`,
  ownership_borrowing_shared_mutable: `fn request_size(line: &str) -> usize {
    line.len()
}

fn append_trace(line: &mut String, trace_id: &str) {
    line.push_str(" trace=");
    line.push_str(trace_id);
}

fn main() {
    let mut request = String::from("GET /ready");
    let len_before = request_size(&request);
    append_trace(&mut request, "abc-123");

    println!("len before = {}", len_before);
    println!("request = {}", request);
}`,
  ownership_borrowing_lifetimes: `fn first_segment(path: &str) -> &str {
    path.split('/').find(|segment| !segment.is_empty()).unwrap_or("root")
}

fn pick_longer<'a>(left: &'a str, right: &'a str) -> &'a str {
    if left.len() >= right.len() { left } else { right }
}

fn make_audit_label(service: &str, key: &str) -> String {
    format!("{}::{}", service, key)
}

fn main() {
    let route = String::from("/api/health");
    let segment = first_segment(&route);
    let longer = pick_longer("job", "request-id");
    let label = make_audit_label("gateway", segment);

    println!("segment = {}", segment);
    println!("longer = {}", longer);
    println!("label = {}", label);
}`,
  ownership_structs_owned_views: `struct LogLine {
    raw: String,
}

impl LogLine {
    fn new(raw: &str) -> Self {
        Self {
            raw: raw.to_string(),
        }
    }

    fn level(&self) -> &str {
        self.raw.split(':').next().unwrap_or("UNKNOWN")
    }

    fn message(&self) -> &str {
        self.raw
            .split_once(':')
            .map(|(_, message)| message.trim())
            .unwrap_or("")
    }
}

fn main() {
    let line = LogLine::new("INFO: user signed in");
    println!("level = {}", line.level());
    println!("message = {}", line.message());
}`,
  ownership_structs_pointer_choices: `use std::rc::Rc;
use std::sync::Arc;
use std::thread;

struct ParserConfig {
    delimiter: Box<str>,
}

#[derive(Clone)]
struct UiTemplate {
    name: Rc<str>,
}

#[derive(Clone)]
struct SharedSchema {
    version: Arc<str>,
}

fn main() {
    let parser = ParserConfig {
        delimiter: "=>".into(),
    };
    let template = UiTemplate {
        name: Rc::from("invoice"),
    };
    let template_copy = template.clone();
    let schema = SharedSchema {
        version: Arc::from("v2"),
    };
    let schema_for_worker = schema.clone();

    let handle = thread::spawn(move || {
        format!("thread schema = {}", schema_for_worker.version)
    });

    println!("box delimiter = {}", parser.delimiter);
    println!("rc clones = {}", Rc::strong_count(&template_copy.name));
    println!("{}", handle.join().unwrap());
}`,
  ownership_vectors_indices: `#[derive(Debug)]
struct Task {
    name: String,
    ready: bool,
}

fn push_task(tasks: &mut Vec<Task>, name: &str) -> usize {
    let index = tasks.len();
    tasks.push(Task {
        name: name.to_string(),
        ready: true,
    });
    index
}

fn mark_not_ready(tasks: &mut [Task], index: usize) {
    tasks[index].ready = false;
}

fn main() {
    let mut tasks = Vec::with_capacity(1);

    let billing = push_task(&mut tasks, "billing");
    push_task(&mut tasks, "search");
    push_task(&mut tasks, "indexer");
    mark_not_ready(&mut tasks, billing);

    println!("task = {}", tasks[billing].name);
    println!("ready = {}", tasks[billing].ready);
    println!("total = {}", tasks.len());
}`,
  ownership_vectors_boxed_stable: `use std::ptr;

#[derive(Debug)]
struct Job {
    name: String,
    attempts: usize,
    needs_retry: bool,
}

fn main() {
    let mut jobs: Vec<Box<Job>> = Vec::new();

    jobs.push(Box::new(Job {
        name: String::from("billing"),
        attempts: 1,
        needs_retry: true,
    }));

    let first_ptr: *const Job = &*jobs[0];

    jobs.push(Box::new(Job {
        name: String::from("search"),
        attempts: 1,
        needs_retry: false,
    }));
    jobs.push(Box::new(Job {
        name: String::from("indexer"),
        attempts: 1,
        needs_retry: false,
    }));

    let same_address = ptr::eq(first_ptr, &*jobs[0]);

    let retry_indices: Vec<usize> = jobs
        .iter()
        .enumerate()
        .filter_map(|(index, job)| job.needs_retry.then_some(index))
        .collect();

    for index in retry_indices {
        jobs[index].attempts += 1;
        jobs[index].needs_retry = false;
    }

    println!("same address = {}", same_address);
    println!("attempts = {}", jobs[0].attempts);
    println!("retry pending = {}", jobs.iter().filter(|job| job.needs_retry).count());
}`,
  copying_data_moves_copy_clone: `#[derive(Debug, Copy, Clone)]
struct RequestId(u64);

#[derive(Debug, Clone)]
struct ServiceConfig {
    name: String,
    retries: usize,
}

impl ServiceConfig {
    fn name(&self) -> &str {
        &self.name
    }

    fn bump_retries(&mut self) {
        self.retries += 1;
    }

    fn replace_name(self, next: &str) -> Self {
        Self {
            name: next.to_string(),
            retries: self.retries,
        }
    }
}

fn main() {
    let request = RequestId(42);
    let request_copy = request;

    let mut live = ServiceConfig {
        name: String::from("ingest-v1"),
        retries: 1,
    };
    live.bump_retries();

    let replaced = live.clone().replace_name("ingest-v2");

    println!("request id copy = {}", request_copy.0);
    println!("live retries = {}", live.retries);
    println!("builder consumed = {}", replaced.name());
    println!("current name = {}", live.name());
}`,
  copying_data_cow_arc: `use std::borrow::Cow;
use std::sync::Arc;

fn normalize_label(input: &str) -> Cow<'_, str> {
    if input.bytes().all(|b| matches!(b, b'a'..=b'z' | b'0'..=b'9' | b'-')) {
        Cow::Borrowed(input)
    } else {
        Cow::Owned(input.trim().to_ascii_lowercase().replace(' ', "-"))
    }
}

fn main() {
    let borrowed = normalize_label("ready");
    let owned = normalize_label("Mixed Case");
    let schema = Arc::new(String::from("event.v1"));
    let worker_schema = Arc::clone(&schema);

    println!("borrowed = {}", borrowed);
    println!("owned = {}", owned);
    println!("strong count = {}", Arc::strong_count(&worker_schema));
}`,
  unsafe_rust_fill_window: `fn fill_window(buf: &mut [u8], start: usize, len: usize, value: u8) {
    assert!(start <= buf.len());
    assert!(start + len <= buf.len());

    let ptr = buf.as_mut_ptr();

    for offset in 0..len {
        unsafe {
            // SAFETY:
            // - \`buf\` is exclusively borrowed for the duration of the call.
            // - bounds were checked above, so \`start + offset\` is in-bounds.
            // - overwriting initialized \`u8\` values is fine because \`u8\` has no drop glue.
            ptr.add(start + offset).write(value);
        }
    }
}

fn main() {
    let mut packet = String::from("header:0000").into_bytes();
    fill_window(&mut packet, 7, 4, 57);

    println!("{}", std::str::from_utf8(&packet).unwrap());
}`,
  unsafe_rust_maybe_uninit: `use std::mem::MaybeUninit;

fn build_header(tag: u8, size: u8) -> [u8; 4] {
    let mut bytes = MaybeUninit::<[u8; 4]>::uninit();
    let ptr = bytes.as_mut_ptr() as *mut u8;

    unsafe {
        // SAFETY:
        // - each element is written exactly once before \`assume_init\`.
        // - no reads occur before initialization completes.
        ptr.add(0).write(tag);
        ptr.add(1).write(size);
        ptr.add(2).write(tag ^ size);
        ptr.add(3).write(255);
        bytes.assume_init()
    }
}

fn main() {
    let header = build_header(7, 10);
    println!("{:?}", header);
}`,
  ...DEFAULT_CODES_CH09,
  ...DEFAULT_CODES_CH10,
  ...DEFAULT_CODES_CH11,
  ...DEFAULT_CODES_CH12,
  ...DEFAULT_CODES_CH13,
  ...DEFAULT_CODES_CH14,
  ...DEFAULT_CODES_CH15,
  ...DEFAULT_CODES_CH16,
  ...DEFAULT_CODES_CH17,
  ...DEFAULT_CODES_CH18,
  ...DEFAULT_CODES_CH19,
  ...DEFAULT_CODES_CH20,
  ...DEFAULT_CODES_CH21,
  ...DEFAULT_CODES_CH22,
  ...DEFAULT_CODES_CH23,
  ...DEFAULT_CODES_CH24,
  ...DEFAULT_CODES_CH25,
  ...DEFAULT_CODES_CH26,
  ...DEFAULT_CODES_CH27,
  ...DEFAULT_CODES_CH28,
  ...DEFAULT_CODES_CH29,
  ...DEFAULT_CODES_CH30,
  ...DEFAULT_CODES_CH31,
  ...DEFAULT_CODES_CH32,
  ...DEFAULT_CODES_CH33,
  ...DEFAULT_CODES_CH34,
  ...DEFAULT_CODES_CH35,
  ...DEFAULT_CODES_CH36,
  ...DEFAULT_CODES_CH37,
  ...DEFAULT_CODES_CH38,
  ...DEFAULT_CODES_CH39,
  ...DEFAULT_CODES_CH40,
  ...DEFAULT_CODES_CH41,
  ...DEFAULT_CODES_CH42,
  ...DEFAULT_CODES_CH43,
  ...DEFAULT_CODES_CH44,
  ...DEFAULT_CODES_CH45,
  ...DEFAULT_CODES_CH46,
  ...DEFAULT_CODES_CH47,
  ...DEFAULT_CODES_CH48,
  ...DEFAULT_CODES_CH49,
  ...DEFAULT_CODES_CH50,
  ...DEFAULT_CODES_CH51,
  ...DEFAULT_CODES_CH52,
  ...DEFAULT_CODES_CH54,
  ...DEFAULT_CODES_CH53,
}
export interface BookState {
  currentPage: number
  completedPages: number[]
  codes: Record<string, string>
  outputs: Record<string, string | null>
}
