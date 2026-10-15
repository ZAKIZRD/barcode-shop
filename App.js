import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as SQLite from "expo-sqlite";

const databasePromise = SQLite.openDatabaseAsync("shop-products.db");

export default function App() {
  const [db, setDb] = useState(null);
  const [screen, setScreen] = useState("scan");
  const [permission, requestPermission] = useCameraPermissions();
  const [barcode, setBarcode] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [result, setResult] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const scanLock = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const database = await databasePromise;
        await database.execAsync(`
          CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barcode TEXT NOT NULL UNIQUE,
            custom_value TEXT NOT NULL
          );
        `);
        if (active) setDb(database);
      } catch (error) {
        Alert.alert("خطأ", "تعذر إنشاء قاعدة البيانات المحلية.");
      }
    })();
    return () => { active = false; };
  }, []);

  async function loadProducts(query = search) {
    if (!db) return;
    try {
      const term = `%${query.trim()}%`;
      const rows = await db.getAllAsync(
        `SELECT id, barcode, custom_value FROM products
         WHERE barcode LIKE ? OR custom_value LIKE ?
         ORDER BY id DESC LIMIT 200`,
        term,
        term
      );
      setProducts(rows);
    } catch {
      Alert.alert("خطأ", "تعذر تحميل قائمة المنتجات.");
    }
  }

  useEffect(() => {
    if (db) loadProducts("");
  }, [db]);

  async function handleBarcodeScanned({ data }) {
    if (scanLock.current || !db) return;
    scanLock.current = true;
    setScanned(true);
    try {
      const code = String(data).trim();
      setBarcode(code);
      const product = await db.getFirstAsync(
        "SELECT id, barcode, custom_value FROM products WHERE barcode = ?",
        code
      );
      setResult(product || { barcode: code, custom_value: null });
    } catch {
      Alert.alert("خطأ", "تعذر البحث عن الباركود.");
      scanLock.current = false;
      setScanned(false);
    }
  }

  function startNewProduct(code = "") {
    setEditingId(null);
    setBarcode(code);
    setCustomValue("");
    setResult(null);
    setScreen("form");
  }

  function startEdit(product) {
    setEditingId(product.id);
    setBarcode(product.barcode);
    setCustomValue(product.custom_value);
    setScreen("form");
  }

  async function saveProduct() {
    const code = barcode.trim();
    const value = customValue.trim();
    if (!code || !value) {
      Alert.alert("تنبيه", "أدخل الباركود والمعلومة المخصصة.");
      return;
    }
    try {
      if (editingId !== null) {
        await db.runAsync(
          "UPDATE products SET barcode = ?, custom_value = ? WHERE id = ?",
          code, value, editingId
        );
      } else {
        await db.runAsync(
          "INSERT INTO products (barcode, custom_value) VALUES (?, ?)",
          code, value
        );
      }
      setResult({ barcode: code, custom_value: value });
      setScanned(true);
      scanLock.current = true;
      setScreen("scan");
      await loadProducts("");
      setSearch("");
      Alert.alert("تم الحفظ", "تم حفظ بيانات المنتج بنجاح.");
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("unique")) {
        Alert.alert("باركود مكرر", "هذا الباركود مسجل مسبقًا.");
      } else {
        Alert.alert("خطأ", "تعذر حفظ المنتج.");
      }
    }
  }

  function deleteProduct(product) {
    Alert.alert("حذف المنتج", "هل تريد حذف هذا المنتج نهائيًا؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await db.runAsync("DELETE FROM products WHERE id = ?", product.id);
            await loadProducts();
            if (result?.barcode === product.barcode) {
              setResult(null);
              setScanned(false);
              scanLock.current = false;
            }
          } catch {
            Alert.alert("خطأ", "تعذر حذف المنتج.");
          }
        }
      }
    ]);
  }

  function resetScanner() {
    setResult(null);
    setBarcode("");
    setScanned(false);
    scanLock.current = false;
  }

  function Button({ title, onPress, secondary = false }) {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.button, secondary && styles.secondaryButton]}
        onPress={onPress}
      >
        <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
          {title}
        </Text>
      </TouchableOpacity>
    );
  }

  if (!db) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={styles.heading}>جاري تجهيز قاعدة البيانات...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />
      <Text style={styles.heading}>إدارة منتجات المحل</Text>

      <View style={styles.nav}>
        <Button title="مسح الباركود" onPress={() => setScreen("scan")} />
        <Button title="المنتجات" secondary onPress={() => {
          setScreen("list");
          loadProducts("");
          setSearch("");
        }} />
        <Button title="إضافة" secondary onPress={() => startNewProduct()} />
      </View>

      {screen === "scan" && (
        <ScrollView contentContainerStyle={styles.content}>
          {!result && (
            <>
              {!permission?.granted ? (
                <View style={styles.panel}>
                  <Text style={styles.text}>
                    اسمح للتطبيق باستخدام الكاميرا حتى يتمكن من قراءة الباركود.
                  </Text>
                  <Button title="السماح باستخدام الكاميرا" onPress={requestPermission} />
                </View>
              ) : (
                <View style={styles.cameraBox}>
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{
                      barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "itf14", "qr"]
                    }}
                    onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                  />
                  <Text style={styles.cameraHint}>وجّه الكاميرا نحو الباركود</Text>
                </View>
              )}
            </>
          )}

          {result && (
            <View style={styles.panel}>
              <Text style={styles.label}>الباركود المقروء</Text>
              <Text selectable style={styles.barcode}>{result.barcode}</Text>
              {result.custom_value ? (
                <>
                  <Text style={styles.label}>المعلومة المخصصة</Text>
                  <Text selectable style={styles.resultValue}>{result.custom_value}</Text>
                  <Button title="تعديل المعلومة" onPress={() => startEdit(result)} />
                </>
              ) : (
                <>
                  <Text style={styles.notFound}>هذا الباركود غير مسجل.</Text>
                  <Button title="تسجيل هذا المنتج" onPress={() => startNewProduct(result.barcode)} />
                </>
              )}
              <Button title="مسح منتج آخر" secondary onPress={resetScanner} />
            </View>
          )}
        </ScrollView>
      )}

      {screen === "form" && (
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.panel}>
              <Text style={styles.label}>الباركود</Text>
              <TextInput
                style={styles.input}
                value={barcode}
                onChangeText={setBarcode}
                placeholder="أدخل رقم الباركود"
                autoCapitalize="none"
              />
              <Text style={styles.label}>المعلومة المخصصة التي ستظهر عند المسح</Text>
              <TextInput
                style={styles.input}
                value={customValue}
                onChangeText={setCustomValue}
                placeholder="مثال: A-125"
                autoCapitalize="none"
              />
              <Button title={editingId !== null ? "حفظ التعديل" : "إضافة المنتج"} onPress={saveProduct} />
              <Button title="إلغاء" secondary onPress={() => setScreen("scan")} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {screen === "list" && (
        <View style={styles.content}>
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              loadProducts(value);
            }}
            placeholder="ابحث بالباركود أو المعلومة"
          />
          <Text style={styles.text}>تظهر حتى 200 نتيجة مطابقة.</Text>
          <FlatList
            data={products}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={styles.productRow}>
                <View style={styles.productInfo}>
                  <Text selectable style={styles.barcode}>{item.barcode}</Text>
                  <Text selectable style={styles.resultValue}>{item.custom_value}</Text>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => startEdit(item)}>
                    <Text style={styles.actionText}>تعديل</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteProduct(item)}>
                    <Text style={styles.deleteText}>حذف</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.text}>لا توجد منتجات مسجلة.</Text>}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6F8", paddingTop: 12 },
  loading: { flex: 1, justifyContent: "center", backgroundColor: "#F4F6F8" },
  heading: { fontSize: 23, fontWeight: "bold", textAlign: "center", marginVertical: 14, color: "#17202A" },
  nav: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, paddingHorizontal: 8, paddingBottom: 12 },
  content: { flexGrow: 1, padding: 14, gap: 12 },
  cameraBox: { height: 350, overflow: "hidden", borderRadius: 16, backgroundColor: "#111" },
  camera: { flex: 1 },
  cameraHint: { color: "#FFF", textAlign: "center", padding: 12, backgroundColor: "#111" },
  panel: { backgroundColor: "#FFF", padding: 18, borderRadius: 14, gap: 12 },
  label: { fontSize: 15, color: "#596574" },
  text: { fontSize: 15, color: "#344054", marginVertical: 6 },
  barcode: { fontSize: 17, fontWeight: "600", color: "#17202A" },
  resultValue: { fontSize: 22, fontWeight: "bold", color: "#147D64", marginVertical: 5 },
  notFound: { fontSize: 17, color: "#B45309", marginVertical: 10 },
  input: { backgroundColor: "#FFF", borderColor: "#D0D5DD", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: "#17202A" },
  button: { backgroundColor: "#167D65", paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#FFF", fontSize: 14, fontWeight: "600" },
  secondaryButton: { backgroundColor: "#E5EAF0" },
  secondaryButtonText: { color: "#243244" },
  productRow: { backgroundColor: "#FFF", borderRadius: 10, padding: 12, marginVertical: 5, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  productInfo: { flex: 1 },
  actions: { gap: 12, alignItems: "flex-end" },
  actionText: { color: "#167D65", fontWeight: "bold" },
  deleteText: { color: "#C0392B", fontWeight: "bold" }
});
