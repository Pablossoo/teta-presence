# Teta Presence Bot

[PL] [Opis w języku polskim znajduje się poniżej](#teta-presence-bot-pl)

---

## Teta Presence Bot [EN]

An automated Chrome extension that handles daily presence confirmation in the Teta system.

### How it works
The extension automates the process of confirming your presence by performing the following steps:
1. **Working Day Check**: It queries the Teta API to check if today is a scheduled working day.
2. **Navigation**: If it's a working day, it navigates to the "Moje zgłoszenia" (My requests) section.
3. **Form Initiation**: It clicks the "+" button to create a new request.
4. **Selection**: It selects "Potwierdzenie obecności" (Presence confirmation) from the list.
5. **Submission**: It clicks the "Prześlij" (Submit) button and verifies if the submission was successful.

### Installation
1. Download or clone this repository.
2. Open Google Chrome.
3. Go to `chrome://extensions/` by typing it in the address bar.
4. Enable **Developer mode** using the toggle in the top right corner.
5. Click the **Load unpacked** button.
6. Select the `teta-presence` folder from your computer.

---

## Teta Presence Bot [PL]

Automatyczne rozszerzenie do Chrome, które zajmuje się codziennym potwierdzaniem obecności w systemie Teta.

### Jak to działa
Rozszerzenie automatyzuje proces potwierdzania obecności, wykonując następujące kroki:
1. **Sprawdzenie dnia roboczego**: Odpytuje API Teta, aby sprawdzić, czy dzisiejszy dzień jest zaplanowany jako dzień pracy.
2. **Nawigacja**: Jeśli jest to dzień roboczy, przechodzi do sekcji „Moje zgłoszenia”.
3. **Inicjalizacja formularza**: Klika przycisk „+”, aby utworzyć nowe zgłoszenie.
4. **Wybór**: Wybiera z listy opcję „Potwierdzenie obecności”.
5. **Wysłanie**: Klika przycisk „Prześlij” i weryfikuje, czy operacja zakończyła się sukcesem.

### Instalacja
1. Pobierz lub sklonuj to repozytorium.
2. Otwórz przeglądarkę Google Chrome.
3. Przejdź pod adres `chrome://extensions/`, wpisując go w pasku adresu.
4. Włącz **Tryb dewelopera** za pomocą przełącznika w prawym górnym rogu.
5. Kliknij przycisk **Załaduj rozpakowane**.
6. Wybierz folder `teta-presence` ze swojego komputera.
