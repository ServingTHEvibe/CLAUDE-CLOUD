/** Handle expired sessions and non-JSON gateway errors without losing editor state. */
export async function readApiResponse(response: Response): Promise<any> {
  if (response.status === 401 || response.redirected) {
    throw new Error(
      "Sign in again to access your private workspace. Your unsaved changes are still on this screen.",
    );
  }
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error("The cloud connection is unavailable. Keep this screen open and retry.");
  }
  if (!response.ok) throw new Error(data.error || "The request failed. Please retry.");
  return data;
}
