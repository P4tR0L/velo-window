## Bike Ride Planner - MVP

### Główny problem

Jazda na rowerze jest nieprzyjemna, gdy wieje silny wiatr, co zniechęca użytkowników do wyjścia na rower i aktywności. Ręczne przeglądanie pogody w poszukiwaniu odpowiedniego czasu, kiedy będą odpowiednie warunki do jazdy, jest czasochłonne, co tym bardziej zniechęca użytkowników.

### Najmniejszy zestaw funkcjonalności

- Znajdowanie odpowiedniego okna pogodowego do jazdy rowerem na podstawie podanego przez użytkowika dnia tygodnia, okresu czasowego (np. od 15:00 do 17:00), minimalnej akceptowalnej temperatury oraz maksymalnej akceptowalnej prędkości wiatru (może nie co do 1 km/h, tylko jakieś przedziały) poprzez pobranie informacji o pogodzie z API
- Rekomendacja trasy przez AI na podstawie widełek czasowych, warunków pogodowych. Wskazówki co do stylu jazdy. Jeśli użytkownik poda lokalizację startową - również rekomendacja przebiegu trasy
- Przeglądanie, edycja i usuwanie zapisanych tras łącznie z wybranymi kryteriami jazdy oraz wskazówkami od AI
- Prosty system kont użytkowników

### Co NIE wchodzi w zakres MVP

- Wspóldzielenie tras pomiędzy użytkownikami
- Import tras z zewnątrz, np. w formacie .gpx
- Integracje z innymi platformami sportowymi typu Strava

### Kryteria sukcesu

- 75% propozycji okien czasowych / tras proponowanych przez AI jest akceptowanych przez użytkownika
