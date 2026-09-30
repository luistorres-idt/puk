import { computed, ref } from 'vue';
import type { AdminUserListItem, SharedTechnicianAccessConfig } from '@puk/contracts';
import {
  getSharedTechnicianAccess,
  updateSharedTechnicianAccount,
} from '@/modules/technical-accounts';
import {
  createUser as createAdminUser,
  listUsers as listAdminUsers,
  updateUser as updateAdminUser,
} from '@/modules/user-management';
import { useMessage } from 'naive-ui';

export function useTechnicalAccounts() {
  const message = useMessage();

  const loadingConfig = ref(true);
  const loadingUsers = ref(true);
  const savingShared = ref(false);
  const error = ref<string | null>(null);
  const configError = ref<string | null>(null);
  const usersError = ref<string | null>(null);
  const config = ref<SharedTechnicianAccessConfig | null>(null);
  const users = ref<AdminUserListItem[]>([]);
  const search = ref('');
  const selectedSharedUserId = ref<string | null>(null);

  const showCreateModal = ref(false);
  const creating = ref(false);
  const newName = ref('');
  const newEmail = ref('');
  const newPassword = ref('');
  const createError = ref<string | null>(null);

  const showPasswordModal = ref(false);
  const updatingPassword = ref(false);
  const targetUser = ref<AdminUserListItem | null>(null);
  const newPasswordInput = ref('');
  const passwordError = ref<string | null>(null);

  const showEditModal = ref(false);
  const updatingUser = ref(false);
  const editName = ref('');
  const editEmail = ref('');
  const editError = ref<string | null>(null);

  async function loadConfig(): Promise<void> {
    loadingConfig.value = true;
    configError.value = null;
    try {
      const cfg = await getSharedTechnicianAccess();
      config.value = cfg;
      selectedSharedUserId.value = cfg.userId;
    } catch (err) {
      configError.value =
        err instanceof Error ? err.message : 'No se pudo cargar la cuenta compartida del taller.';
    } finally {
      loadingConfig.value = false;
    }
  }

  async function loadUsers(): Promise<void> {
    loadingUsers.value = true;
    usersError.value = null;
    try {
      users.value = await listAdminUsers();
    } catch (err) {
      usersError.value =
        err instanceof Error ? err.message : 'Error al cargar la información de cuentas técnicas.';
    } finally {
      loadingUsers.value = false;
    }
  }

  async function loadData(): Promise<void> {
    error.value = null;
    await Promise.all([loadConfig(), loadUsers()]);
  }

  const technicianUsers = computed(() => users.value.filter((user) => user.role === 'TECHNICIAN'));
  const filteredTechnicians = computed(() => {
    const query = search.value.trim().toLowerCase();
    if (!query) return technicianUsers.value;
    return technicianUsers.value.filter(
      (user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query),
    );
  });
  const sharedCandidates = computed(() =>
    technicianUsers.value.filter((user) => user.active && user.technicianId === null),
  );
  const sharedSelectOptions = computed(() => [
    { label: '— Sin cuenta asignada —', value: '' },
    ...sharedCandidates.value.map((user) => ({
      label: `${user.name} (${user.email})`,
      value: user.id,
    })),
  ]);

  async function handleSaveSharedAccount(): Promise<void> {
    if (!config.value) return;
    savingShared.value = true;
    error.value = null;
    try {
      const targetUserId =
        selectedSharedUserId.value && selectedSharedUserId.value.length > 0
          ? selectedSharedUserId.value
          : null;
      const updated = await updateSharedTechnicianAccount({
        expectedRevision: config.value.revision,
        userId: targetUserId,
      });
      config.value = updated;
      selectedSharedUserId.value = updated.userId;
      message.success('Cuenta técnica compartida actualizada correctamente.');
      await Promise.all([loadConfig(), loadUsers()]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      error.value = msg || 'Error al guardar la designación de cuenta compartida.';
      await Promise.all([loadConfig(), loadUsers()]);
    } finally {
      savingShared.value = false;
    }
  }

  function openCreateModal(): void {
    newName.value = '';
    newEmail.value = '';
    newPassword.value = '';
    createError.value = null;
    showCreateModal.value = true;
  }

  async function handleCreateUser(): Promise<void> {
    const name = newName.value.trim();
    const email = newEmail.value.trim();
    const password = newPassword.value;
    if (!name) {
      createError.value = 'El nombre es obligatorio.';
      return;
    }
    if (!email || !email.includes('@')) {
      createError.value = 'Ingresa un correo electrónico válido.';
      return;
    }
    if (password.length < 12) {
      createError.value = 'La contraseña debe tener al menos 12 caracteres.';
      return;
    }
    creating.value = true;
    createError.value = null;
    try {
      const created = await createAdminUser({
        email,
        name,
        password,
        role: 'TECHNICIAN',
        technicianId: null,
      });
      message.success(`Cuenta creada para ${created.name}`);
      await loadData();
      showCreateModal.value = false;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      createError.value = msg || 'Error al crear la cuenta técnica.';
    } finally {
      creating.value = false;
    }
  }

  function openPasswordModal(user: AdminUserListItem): void {
    targetUser.value = user;
    newPasswordInput.value = '';
    passwordError.value = null;
    showPasswordModal.value = true;
  }

  async function handleResetPassword(): Promise<void> {
    if (!targetUser.value) return;
    if (newPasswordInput.value.length < 12) {
      passwordError.value = 'La nueva contraseña debe tener al menos 12 caracteres.';
      return;
    }
    updatingPassword.value = true;
    passwordError.value = null;
    try {
      await updateAdminUser(targetUser.value.id, { password: newPasswordInput.value });
      message.success(`Contraseña actualizada para ${targetUser.value.name}`);
      showPasswordModal.value = false;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      passwordError.value = msg || 'Error al restablecer la contraseña.';
    } finally {
      updatingPassword.value = false;
    }
  }

  function openEditModal(user: AdminUserListItem): void {
    targetUser.value = user;
    editName.value = user.name;
    editEmail.value = user.email;
    editError.value = null;
    showEditModal.value = true;
  }

  async function handleUpdateUserData(): Promise<void> {
    if (!targetUser.value) return;
    const name = editName.value.trim();
    const email = editEmail.value.trim();
    if (!name) {
      editError.value = 'El nombre es obligatorio.';
      return;
    }
    if (!email || !email.includes('@')) {
      editError.value = 'Ingresa un correo válido.';
      return;
    }
    updatingUser.value = true;
    editError.value = null;
    try {
      await updateAdminUser(targetUser.value.id, { email, name });
      message.success('Datos actualizados.');
      showEditModal.value = false;
      await loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      editError.value = msg || 'Error al actualizar los datos.';
    } finally {
      updatingUser.value = false;
    }
  }

  async function handleToggleActive(user: AdminUserListItem): Promise<void> {
    try {
      await updateAdminUser(user.id, { active: !user.active });
      message.success(`Cuenta ${!user.active ? 'activada' : 'desactivada'}.`);
      await loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response
        ?.data?.error?.message;
      message.error(msg || 'Error al modificar el estado de la cuenta.');
    }
  }

  return {
    config,
    createError,
    creating,
    editEmail,
    editError,
    editName,
    error,
    configError,
    filteredTechnicians,
    handleCreateUser,
    handleResetPassword,
    handleSaveSharedAccount,
    handleToggleActive,
    handleUpdateUserData,
    loading: computed(() => loadingConfig.value || loadingUsers.value),
    loadingConfig,
    loadingUsers,
    loadData,
    loadConfig,
    loadUsers,
    newEmail,
    newName,
    newPassword,
    newPasswordInput,
    openCreateModal,
    openEditModal,
    openPasswordModal,
    passwordError,
    savingShared,
    search,
    selectedSharedUserId,
    sharedSelectOptions,
    showCreateModal,
    showEditModal,
    showPasswordModal,
    targetUser,
    technicianUsers,
    usersError,
    updatingPassword,
    updatingUser,
    users,
  };
}
