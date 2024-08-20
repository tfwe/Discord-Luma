import numpy as np
import matplotlib.pyplot as plt
from scipy import stats

# Parameters
n_simulations = 10000
n_pokemon = 1015  # Total number of unique Pokémon as of 2023
n_lions = 1_000_000_000

# Simple power scaling
pokemon_power = np.random.uniform(1, 100, n_pokemon)  # Each Pokémon has a power between 1 and 100
lion_power = np.random.uniform(0.1, 1, n_lions)  # Each lion has a power between 0.1 and 1

# Run simulations
results = []
for _ in range(n_simulations):
    pokemon_total = np.sum(pokemon_power)
    lion_total = np.sum(np.random.choice(lion_power, size=n_lions, replace=True))
    results.append(pokemon_total > lion_total)

pokemon_win_rate = np.mean(results)

print(f"Pokémon win rate: {pokemon_win_rate:.2%}")

# Create a beautiful wavy graph
x = np.linspace(0, 10, 1000)
pokemon_wave = np.sin(x) * np.exp(-0.1 * x) + 1
lion_wave = np.cos(x) * np.exp(-0.1 * x) + 1

plt.figure(figsize=(12, 6))
plt.plot(x, pokemon_wave, label='Pokémon', color='red')
plt.plot(x, lion_wave, label='Lions', color='orange')
plt.fill_between(x, pokemon_wave, lion_wave, where=(pokemon_wave > lion_wave), 
                 interpolate=True, color='red', alpha=0.3)
plt.fill_between(x, pokemon_wave, lion_wave, where=(pokemon_wave <= lion_wave), 
                 interpolate=True, color='orange', alpha=0.3)
plt.title('Pokémon vs Lions: Battle Intensity Over Time')
plt.xlabel('Time')
plt.ylabel('Battle Intensity')
plt.legend()
plt.grid(True, alpha=0.3)
plt.savefig('pokemon_vs_lions.png')

# Create a probability distribution graph
plt.figure(figsize=(12, 6))
kde_pokemon = stats.gaussian_kde(pokemon_power)
kde_lion = stats.gaussian_kde(lion_power)
x_range = np.linspace(0, 100, 1000)
plt.plot(x_range, kde_pokemon(x_range), label='Pokémon', color='red')
plt.plot(x_range, kde_lion(x_range), label='Lions', color='orange')
plt.title('Power Distribution: Pokémon vs Lions')
plt.xlabel('Power Level')
plt.ylabel('Probability Density')
plt.legend()
plt.grid(True, alpha=0.3)
plt.savefig('power_distribution.png')

print("Graphs have been saved as 'pokemon_vs_lions.png' and 'power_distribution.png'")