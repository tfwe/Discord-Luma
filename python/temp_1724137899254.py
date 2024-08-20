import numpy as np
import matplotlib.pyplot as plt

def simulate_battle(n_simulations=10000):
    pokemon_strength = np.random.normal(100, 30, 1015)
    lion_strength = np.random.normal(50, 10, 1_000_000_000)
    
    results = []
    for _ in range(n_simulations):
        pokemon_power = np.sum(np.random.choice(pokemon_strength, 1015, replace=False))
        lion_power = np.sum(np.random.choice(lion_strength, 1_000_000_000, replace=True))
        results.append(pokemon_power > lion_power)
    
    return results

results = simulate_battle()
pokemon_win_prob = np.mean(results)

plt.figure(figsize=(8, 6))
plt.hist(results, bins=50, density=True, alpha=0.7)
plt.xlabel('Pokémon Victory (1) vs Lion Victory (0)')
plt.ylabel('Probability Density')
plt.title('Distribution of Battle Outcomes')
plt.savefig('battle_outcomes.png')
plt.close()

print(f"Probability of Pokémon winning: {pokemon_win_prob:.2%}")
print(f"Probability of Lions winning: {1 - pokemon_win_prob:.2%}")