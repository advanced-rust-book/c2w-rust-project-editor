export const DEFAULT_CRAB_STRATEGY_CODE = `#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Action {
    Up,
    Right,
    Down,
    Left,
    Stay,
    Escape,
    ChaseFish,
    WanderClockwise,
    WanderCounterclockwise,
    RandomSafe,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Heading {
    Up,
    Right,
    Down,
    Left,
}

impl Heading {
    const CLOCKWISE: [Heading; 4] = [
        Heading::Right,
        Heading::Down,
        Heading::Left,
        Heading::Up,
    ];

    const fn action(self) -> Action {
        match self {
            Heading::Up => Action::Up,
            Heading::Right => Action::Right,
            Heading::Down => Action::Down,
            Heading::Left => Action::Left,
        }
    }

    const fn label(self) -> &'static str {
        match self {
            Heading::Up => "up",
            Heading::Right => "right",
            Heading::Down => "down",
            Heading::Left => "left",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Zone {
    Sand,
    Water,
}

trait BeachView {
    fn predator_adjacent(&self) -> bool;
    fn predator_near(&self) -> bool;
    fn fish_here(&self) -> bool;
    fn fish_up(&self) -> bool;
    fn fish_right(&self) -> bool;
    fn fish_down(&self) -> bool;
    fn fish_left(&self) -> bool;
    fn open_up(&self) -> bool;
    fn open_right(&self) -> bool;
    fn open_down(&self) -> bool;
    fn open_left(&self) -> bool;
    fn safe_up(&self) -> bool;
    fn safe_right(&self) -> bool;
    fn safe_down(&self) -> bool;
    fn safe_left(&self) -> bool;
    fn on_sand(&self) -> bool;
    fn on_water(&self) -> bool;

    fn zone(&self) -> Zone {
        if self.on_water() {
            Zone::Water
        } else {
            Zone::Sand
        }
    }

    fn safe(&self, heading: Heading) -> bool {
        match heading {
            Heading::Up => self.safe_up(),
            Heading::Right => self.safe_right(),
            Heading::Down => self.safe_down(),
            Heading::Left => self.safe_left(),
        }
    }
}

trait CrabStrategy {
    fn name(&self) -> &'static str {
        "trait-based crab strategy"
    }

    fn choose_action(&self, view: &dyn BeachView) -> Action;
}

#[derive(Clone, Copy, Debug)]
struct Priority<'a> {
    label: &'a str,
    action: Action,
}

#[derive(Clone, Copy, Debug)]
struct ShorelineScholar {
    patrol: [Heading; 4],
    panic_radius: usize,
}

impl Default for ShorelineScholar {
    fn default() -> Self {
        Self {
            patrol: Heading::CLOCKWISE,
            panic_radius: 2,
        }
    }
}

impl ShorelineScholar {
    const FISH_LABELS: [&'static str; 4] = ["fish_right", "fish_down", "fish_left", "fish_up"];
    const SAFE_LABELS: [&'static str; 4] = ["safe_right", "safe_down", "safe_left", "safe_up"];

    fn preview<'a>(&'a self) -> Vec<Priority<'a>> {
        self.patrol
            .iter()
            .copied()
            .map(|heading| Priority {
                label: heading.label(),
                action: heading.action(),
            })
            .collect::<Vec<_>>()
    }

    fn first_safe_heading(&self, view: &dyn BeachView) -> Option<Heading> {
        self.patrol
            .iter()
            .copied()
            .find(|heading| view.safe(*heading))
    }

    fn note_rust_features(&self, view: &dyn BeachView) {
        let preview = self.preview();
        let _preview_labels = preview
            .iter()
            .map(|rule| rule.label)
            .chain(Self::FISH_LABELS.iter().copied())
            .chain(Self::SAFE_LABELS.iter().copied())
            .collect::<Vec<_>>();

        let _zone_is_water = matches!(view.zone(), Zone::Water);
        let _panic_radius_is_useful = self.panic_radius >= 2;
        let _first_safe = self
            .first_safe_heading(view)
            .map(|heading| heading.label())
            .unwrap_or("none");

        let _what_this_template_shows = (
            "traits",
            "dyn trait parameters",
            "enums + match",
            "const arrays",
            "structs",
            "iterators",
            "closures",
            "Option",
            "lifetimes",
            "collect::<Vec<_>>()",
            "matches!",
        );
    }
}

impl CrabStrategy for ShorelineScholar {
    fn choose_action(&self, view: &dyn BeachView) -> Action {
        self.note_rust_features(view);

        if view.predator_adjacent() || view.predator_near() {
            return Action::Escape;
        }

        if view.fish_here() {
            return Action::Stay;
        }

        if view.fish_right() && view.safe_right() {
            return Action::Right;
        }

        if view.fish_down() && view.safe_down() {
            return Action::Down;
        }

        if view.fish_left() && view.safe_left() {
            return Action::Left;
        }

        if view.fish_up() && view.safe_up() {
            return Action::Up;
        }

        if view.safe_right() {
            return Action::Right;
        }

        if view.safe_down() {
            return Action::Down;
        }

        if view.safe_left() {
            return Action::Left;
        }

        if view.safe_up() {
            return Action::Up;
        }

        if view.on_sand() {
            return Action::WanderClockwise;
        }

        if view.on_water() {
            return Action::RandomSafe;
        }

        Action::Stay
    }
}

fn strategy() -> impl CrabStrategy {
    ShorelineScholar::default()
}

// BeachView methods available in the web lab:
// predator_adjacent, predator_near, fish_here, fish_up, fish_right, fish_down, fish_left,
// open_up, open_right, open_down, open_left,
// safe_up, safe_right, safe_down, safe_left,
// on_sand, on_water
//
// Action variants available in the web lab:
// Action::Up, Action::Right, Action::Down, Action::Left, Action::Stay,
// Action::Escape, Action::ChaseFish,
// Action::WanderClockwise, Action::WanderCounterclockwise, Action::RandomSafe
}`;
